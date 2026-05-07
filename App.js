/**
 * EduHaïti — Application Mobile de Gestion Scolaire
 * React Native / Expo — Single-file Production App
 *
 * Architecture:
 *  - No hardcoded URL: each school enters their GAS deployment URL on first launch
 *  - All API calls go via HTTP GET to ?action=<action>&token=<token>&...params
 *  - Token stored in SecureStore (encrypted)
 *  - Multi-tenant safe: switching schools clears all state
 */

// ─── Deep linking (Expo) ─────────────────────────────────────────────────────
// Intercepte eduhaiti://setup?url=...&name=... pour configurer l'ecole auto.
// Installer : npx expo install expo-linking
let Linking;
try { Linking = require('expo-linking'); } catch(_) { Linking = null; }

import React, {
  useState, useEffect, useCallback, useRef, createContext, useContext
} from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, FlatList,
  StyleSheet, StatusBar, ActivityIndicator, Alert, Modal,
  RefreshControl, KeyboardAvoidingView, Platform, Dimensions,
  Animated, SafeAreaView, Image
} from 'react-native';

// ─── Secure Storage (Expo) ──────────────────────────────────────────────────
// If expo-secure-store is not installed, falls back to a non-encrypted in-memory store.
// Run: npx expo install expo-secure-store
let SecureStore;
try {
  SecureStore = require('expo-secure-store');
} catch (_) {
  const _mem = {};
  SecureStore = {
    setItemAsync: async (k, v) => { _mem[k] = v; },
    getItemAsync: async (k)    => _mem[k] || null,
    deleteItemAsync: async (k) => { delete _mem[k]; }
  };
}

// ─── Design Tokens (mirrors web app) ────────────────────────────────────────
const T = {
  navy:       '#1C1152',
  navyMid:    '#281870',
  navyLight:  '#3420A0',
  gold:       '#C97F0A',
  goldPale:   '#FEF3DC',
  coral:      '#CC3322',
  coralPale:  '#FEECE9',
  mint:       '#0D8860',
  mintPale:   '#E0F5EE',
  sky:        '#1460AB',
  skyPale:    '#E3EDF9',
  cream:      '#F2F1FA',
  stone:      '#EDEAF6',
  border:     '#D6D1EE',
  white:      '#FFFFFF',
  textDark:   '#170F2C',
  textMid:    '#4E4870',
  textLight:  '#9891B6',
  radius:     14,
  radiusSm:   9,
};

const { width: SW } = Dimensions.get('window');

// ─── App Context ─────────────────────────────────────────────────────────────
const AppCtx = createContext(null);
const useApp = () => useContext(AppCtx);

// ─── Composant logo de l'école ────────────────────────────────────────────────
// Affiche le logo distant si disponible, sinon replie sur l'initiale de l'école.
function SchoolLogo({ size = 38, style }) {
  const ctx = useApp();
  const schoolLogo = ctx ? ctx.schoolLogo : '';
  const schoolName = ctx ? ctx.schoolName : '';
  const [error, setError] = useState(false);
  if (schoolLogo && !error) {
    return (
      <Image
        source={{ uri: schoolLogo }}
        style={[{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: T.stone }, style]}
        resizeMode="contain"
        onError={() => setError(true)}
      />
    );
  }
  // Fallback : cercle avec initiale
  return (
    <View style={[{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: T.navy, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ fontSize: size * 0.45, fontWeight: '900', color: T.white }}>
        {(schoolName || 'E')[0].toUpperCase()}
      </Text>
    </View>
  );
}

// ─── API Layer ───────────────────────────────────────────────────────────────
async function apiCall(baseUrl, action, params = {}, token = null) {
  const qs = new URLSearchParams({ action, ...(token ? { token } : {}), ...params });
  const url = `${baseUrl}?${qs.toString()}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── Storage Helpers ─────────────────────────────────────────────────────────
// ─── Deep link scheme ────────────────────────────────────────────────────────
const DEEP_LINK_SCHEME = 'eduhaiti';
const DEEP_LINK_PREFIX = Linking
  ? Linking.createURL('/')
  : 'eduhaiti://';

const KEYS = {
  schoolUrl:  'edu_school_url',
  token:      'edu_token',
  role:       'edu_role',
  name:       'edu_name',
  email:      'edu_email',
  schoolName: 'edu_school_name',
  schoolLogo: 'edu_school_logo',
};
const store  = (k, v) => SecureStore.setItemAsync(k, v || '');
const load   = (k)    => SecureStore.getItemAsync(k);
const remove = (k)    => SecureStore.deleteItemAsync(k);

// ═══════════════════════════════════════════════════════════════════════════
// SHARED UI COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function Pill({ label, color = T.navy, bg }) {
  return (
    <View style={[s.pill, { backgroundColor: bg || T.stone }]}>
      <Text style={[s.pillTxt, { color }]}>{label}</Text>
    </View>
  );
}

function Card({ children, style }) {
  return <View style={[s.card, style]}>{children}</View>;
}

function Btn({ label, onPress, variant = 'primary', icon, loading, disabled, style }) {
  const bg = variant === 'primary' ? T.gold
           : variant === 'danger'  ? T.coral
           : variant === 'outline' ? 'transparent'
           : T.stone;
  const color = (variant === 'outline' || variant === 'ghost') ? T.navy : T.white;
  const border = variant === 'outline' ? { borderWidth: 1.5, borderColor: T.border } : {};
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[s.btn, { backgroundColor: bg, opacity: disabled ? 0.5 : 1 }, border, style]}
    >
      {loading
        ? <ActivityIndicator color={color} size="small" />
        : <Text style={[s.btnTxt, { color }]}>{icon ? `${icon}  ` : ''}{label}</Text>
      }
    </TouchableOpacity>
  );
}

function SectionHeader({ title, subtitle, action, onAction }) {
  return (
    <View style={s.sectionHeader}>
      <View style={{ flex: 1 }}>
        <Text style={s.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={s.sectionSub}>{subtitle}</Text> : null}
      </View>
      {action
        ? <TouchableOpacity onPress={onAction}>
            <Text style={s.sectionAction}>{action}</Text>
          </TouchableOpacity>
        : null
      }
    </View>
  );
}

function StatCard({ label, value, icon, color = T.navy, bg }) {
  return (
    <Card style={[s.statCard, { borderLeftColor: color }]}>
      <Text style={[s.statIcon]}>{icon}</Text>
      <Text style={[s.statValue, { color }]}>{value ?? '—'}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </Card>
  );
}

function EmptyState({ icon = '📭', title, subtitle }) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyIcon}>{icon}</Text>
      <Text style={s.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={s.emptySub}>{subtitle}</Text> : null}
    </View>
  );
}

function LoadingView({ label = 'Chargement…' }) {
  return (
    <View style={s.loadingView}>
      <ActivityIndicator color={T.navy} size="large" />
      <Text style={s.loadingLabel}>{label}</Text>
    </View>
  );
}

function TopBar({ title, subtitle, onBack, rightAction }) {
  return (
    <View style={s.topBar}>
      {onBack
        ? <TouchableOpacity onPress={onBack} style={s.topBarBack}>
            <Text style={s.topBarBackIcon}>‹</Text>
          </TouchableOpacity>
        : <View style={{ width: 36 }} />
      }
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={s.topBarTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={s.topBarSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {rightAction
        ? <View style={{ width: 36, alignItems: 'flex-end' }}>{rightAction}</View>
        : <View style={{ width: 36 }} />
      }
    </View>
  );
}

function SearchBar({ value, onChangeText, placeholder = 'Rechercher…', style }) {
  return (
    <View style={[s.searchBar, style]}>
      <Text style={s.searchIcon}>🔍</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={T.textLight}
        style={s.searchInput}
      />
      {value ? (
        <TouchableOpacity onPress={() => onChangeText('')}>
          <Text style={{ color: T.textLight, fontSize: 16 }}>✕</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCREEN: SCHOOL URL SETUP
// ═══════════════════════════════════════════════════════════════════════════
function SetupScreen({ onDone }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function validate() {
    const trimmed = url.trim().replace(/\/+$/, '');
    if (!trimmed.startsWith('https://')) {
      setError('L\'URL doit commencer par https://');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await apiCall(trimmed, 'ping');
      if (res && (res.success || res.status === 'ok' || res.status === 'online' || res.pong)) {
        await store(KEYS.schoolUrl, trimmed);
        onDone(trimmed);
      } else {
        setError('URL invalide ou école introuvable. Vérifiez et réessayez.');
      }
    } catch (e) {
      setError('Connexion échouée. Vérifiez l\'URL et votre connexion internet.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: T.cream }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={s.setupContainer}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo / Brand */}
          <View style={s.setupBrand}>
            <View style={s.setupLogo}>
              <Text style={s.setupLogoText}>E</Text>
            </View>
            <Text style={s.setupAppName}>EduHaïti</Text>
            <Text style={s.setupTagline}>Système de Gestion Scolaire</Text>
          </View>

          {/* Card */}
          <Card style={s.setupCard}>
            <Text style={s.setupCardTitle}>Connexion à votre école</Text>
            <Text style={s.setupCardSub}>
              Entrez l'URL de déploiement de votre école.{'\n'}
              Exemple : https://script.google.com/macros/s/AKfy.../exec
            </Text>

            <Text style={s.fieldLabel}>URL de déploiement</Text>
            <TextInput
              value={url}
              onChangeText={t => { setUrl(t); setError(''); }}
              placeholder="https://script.google.com/macros/s/…/exec"
              placeholderTextColor={T.textLight}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[s.input, error ? { borderColor: T.coral } : {}]}
              onSubmitEditing={validate}
              returnKeyType="go"
            />

            {error ? (
              <View style={s.errorBox}>
                <Text style={s.errorTxt}>⚠️  {error}</Text>
              </View>
            ) : null}

            <Btn label="Continuer" onPress={validate} loading={loading} style={{ marginTop: 8 }} />
          </Card>

          <Text style={s.setupFooter}>
            Chaque école possède sa propre URL sécurisée.{'\n'}
            Vos données restent sur les serveurs de votre école.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCREEN: LOGIN
// ═══════════════════════════════════════════════════════════════════════════
function LoginScreen({ schoolUrl, schoolName, onLogin, onChangeSchool }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [mode, setMode]         = useState('staff'); // staff | student | parent

  async function doLogin() {
    if (!email.trim() || !password.trim()) {
      setError('Veuillez remplir tous les champs.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      let res;
      if (mode === 'staff') {
        res = await apiCall(schoolUrl, 'attemptSheetLogin', { email: email.trim(), password });
      } else if (mode === 'student') {
        res = await apiCall(schoolUrl, 'studentPortalLogin', { studentCode: email.trim(), pin: password });
      } else {
        res = await apiCall(schoolUrl, 'parentPortalLogin', { studentCode: email.trim(), parentPhone: password });
      }

      if (res && res.success && res.token) {
        await store(KEYS.token, res.token);
        await store(KEYS.role, res.role || res.viewer?.role || 'Staff');
        await store(KEYS.name, res.name || res.viewer?.name || '');
        await store(KEYS.email, email.trim());
        onLogin({
          token: res.token,
          role: res.role || res.viewer?.role || 'Staff',
          name: res.name || res.viewer?.name || email.trim(),
          email: email.trim(),
          permissions: res.permissions || res.viewer?.permissions || {}
        });
      } else {
        setError(res?.message || 'Identifiants incorrects. Réessayez.');
      }
    } catch (e) {
      setError('Erreur de connexion. Vérifiez votre connexion internet.');
    } finally {
      setLoading(false);
    }
  }

  const tabs = [
    { key: 'staff',   label: 'Personnel',  icon: '👔' },
    { key: 'student', label: 'Élève',       icon: '🎓' },
    { key: 'parent',  label: 'Parent',      icon: '👪' },
  ];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: T.cream }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.loginContainer} keyboardShouldPersistTaps="handled">
          {/* School badge */}
          <View style={s.schoolBadge}>
            <Text style={s.schoolBadgeIcon}>🏫</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.schoolBadgeName}>{schoolName || 'École'}</Text>
              <Text style={s.schoolBadgeUrl} numberOfLines={1}>{schoolUrl}</Text>
            </View>
            <TouchableOpacity onPress={onChangeSchool} style={s.changeSchoolBtn}>
              <Text style={s.changeSchoolTxt}>Changer</Text>
            </TouchableOpacity>
          </View>

          <Card style={s.loginCard}>
            <Text style={s.loginTitle}>Connexion</Text>

            {/* Mode tabs */}
            <View style={s.modeTabs}>
              {tabs.map(t => (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => { setMode(t.key); setError(''); }}
                  style={[s.modeTab, mode === t.key && s.modeTabActive]}
                >
                  <Text style={[s.modeTabTxt, mode === t.key && s.modeTabTxtActive]}>
                    {t.icon} {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>
              {mode === 'staff' ? 'Adresse email' : 'Code élève'}
            </Text>
            <TextInput
              value={email}
              onChangeText={t => { setEmail(t); setError(''); }}
              placeholder={mode === 'staff' ? 'prenom.nom@ecole.ht' : 'ELV-2024-001'}
              placeholderTextColor={T.textLight}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={mode === 'staff' ? 'email-address' : 'default'}
              style={s.input}
            />

            <Text style={s.fieldLabel}>
              {mode === 'staff' ? 'Mot de passe' : mode === 'student' ? 'Code PIN' : 'Téléphone parent'}
            </Text>
            <TextInput
              value={password}
              onChangeText={t => { setPassword(t); setError(''); }}
              placeholder={mode === 'student' ? '• • • •' : mode === 'parent' ? '509 XXXX XXXX' : '••••••••'}
              placeholderTextColor={T.textLight}
              secureTextEntry={mode !== 'parent'}
              keyboardType={mode === 'parent' ? 'phone-pad' : 'default'}
              style={s.input}
              onSubmitEditing={doLogin}
              returnKeyType="done"
            />

            {error ? (
              <View style={s.errorBox}>
                <Text style={s.errorTxt}>⚠️  {error}</Text>
              </View>
            ) : null}

            <Btn label="Se connecter" onPress={doLogin} loading={loading} style={{ marginTop: 12 }} />
          </Card>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCREEN: DASHBOARD (Home)
// ═══════════════════════════════════════════════════════════════════════════
function DashboardScreen() {
  const { api, user } = useApp();
  const [stats, setStats]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const res = await api('getDashboardLiveStats');
      if (res?.success) setStats(res.data || res);
    } catch (_) {}
    finally { setLoading(false); setRefreshing(false); }
  }, [api]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const fmt = v => {
    if (v === undefined || v === null) return '—';
    if (typeof v === 'number') return v.toLocaleString('fr-HT');
    return String(v);
  };

  const fmtCurrency = v => {
    if (!v && v !== 0) return '—';
    return `${Number(v).toLocaleString('fr-HT')} HTG`;
  };

  return (
    <ScrollView
      style={s.screen}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchStats(true); }} tintColor={T.navy} />}
    >
      {/* Welcome */}
      <View style={s.welcomeBanner}>
        <View>
          <Text style={s.welcomeGreet}>Bonjour, {user.name?.split(' ')[0] || 'Utilisateur'} 👋</Text>
          <Text style={s.welcomeRole}>{user.role}</Text>
        </View>
        <View style={s.avatarCircle}>
          <Text style={s.avatarInitial}>{(user.name || 'U')[0].toUpperCase()}</Text>
        </View>
      </View>

      {loading ? <LoadingView label="Chargement des statistiques…" /> : (
        <>
          {/* Stats grid */}
          <View style={s.statsGrid}>
            <StatCard label="Élèves inscrits" value={fmt(stats?.totalStudents)}     icon="🎓" color={T.navy}  />
            <StatCard label="Présents aujourd'hui" value={fmt(stats?.presentToday)} icon="✅" color={T.mint}  />
            <StatCard label="Paiements en attente" value={fmt(stats?.pendingPayments || stats?.unpaidCount)} icon="⏳" color={T.gold} />
            <StatCard label="Arriérés totaux"  value={fmtCurrency(stats?.totalOutstanding)} icon="💰" color={T.coral} />
          </View>

          {/* Quick actions */}
          <SectionHeader title="Accès rapide" />
          <QuickActions />
        </>
      )}
    </ScrollView>
  );
}

function QuickActions() {
  const { navigate } = useApp();
  const actions = [
    { label: 'Élèves',        icon: '👥', screen: 'students' },
    { label: 'Présences',     icon: '📋', screen: 'attendance' },
    { label: 'Notes',         icon: '📊', screen: 'grades' },
    { label: 'Finance',       icon: '💳', screen: 'finance' },
    { label: 'Promotion',     icon: '🏆', screen: 'promotion' },
    { label: 'Emploi du temps', icon: '🗓️', screen: 'timetable' },
    { label: 'Personnel',     icon: '👔', screen: 'users' },
    { label: 'Paramètres',    icon: '⚙️', screen: 'settings' },
  ];
  return (
    <View style={s.qaGrid}>
      {actions.map(a => (
        <TouchableOpacity key={a.screen} onPress={() => navigate(a.screen)} style={s.qaItem} activeOpacity={0.75}>
          <View style={s.qaIcon}><Text style={s.qaIconTxt}>{a.icon}</Text></View>
          <Text style={s.qaLabel}>{a.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCREEN: STUDENTS
// ═══════════════════════════════════════════════════════════════════════════
function StudentsScreen() {
  const { api } = useApp();
  const [students, setStudents]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery]         = useState('');
  const [selected, setSelected]   = useState(null);

  const fetchStudents = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const res = await api('getAllStudents');
      if (res?.success && Array.isArray(res.students || res.data)) {
        setStudents(res.students || res.data);
      }
    } catch (_) {}
    finally { setLoading(false); setRefreshing(false); }
  }, [api]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  const filtered = students.filter(s => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      String(s.name || s.fullName || '').toLowerCase().includes(q) ||
      String(s.studentCode || s.code || '').toLowerCase().includes(q) ||
      String(s.class || s.className || '').toLowerCase().includes(q)
    );
  });

  if (selected) return (
    <StudentDetailScreen student={selected} onBack={() => setSelected(null)} />
  );

  return (
    <View style={{ flex: 1 }}>
      <SearchBar value={query} onChangeText={setQuery} placeholder="Nom, code ou classe…" style={{ margin: 16 }} />
      {loading ? <LoadingView /> : (
        <FlatList
          data={filtered}
          keyExtractor={(_, i) => String(i)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchStudents(true); }} tintColor={T.navy} />}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => setSelected(item)} activeOpacity={0.8}>
              <Card style={s.studentRow}>
                <View style={s.studentAvatar}>
                  <Text style={s.studentAvatarTxt}>{(item.name || item.fullName || '?')[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.studentName}>{item.name || item.fullName || 'Sans nom'}</Text>
                  <Text style={s.studentMeta}>{item.class || item.className || '—'} • {item.studentCode || item.code || '—'}</Text>
                </View>
                <Pill
                  label={item.active !== false ? 'Actif' : 'Inactif'}
                  color={item.active !== false ? T.mint : T.textLight}
                  bg={item.active !== false ? T.mintPale : T.stone}
                />
              </Card>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<EmptyState icon="👥" title="Aucun élève trouvé" subtitle={query ? 'Modifiez votre recherche' : 'La liste est vide'} />}
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}
    </View>
  );
}

function StudentDetailScreen({ student, onBack }) {
  const { api } = useApp();
  const [details, setDetails] = useState(student);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const id = student.id || student.studentCode || student.code;
        const [det, pay] = await Promise.all([
          api('getStudent', { id }),
          api('getStudentPayments', { studentId: id })
        ]);
        if (det?.success) setDetails(det.student || det.data || student);
        if (pay?.success && Array.isArray(pay.payments || pay.data)) {
          setPayments(pay.payments || pay.data);
        }
      } catch (_) {}
      finally { setLoading(false); }
    })();
  }, [student.id]);

  const field = (label, value) => value ? (
    <View style={s.detailRow} key={label}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{String(value)}</Text>
    </View>
  ) : null;

  return (
    <View style={{ flex: 1 }}>
      <TopBar title={details.name || details.fullName || 'Élève'} subtitle={details.class || details.className} onBack={onBack} />
      <ScrollView style={s.screen}>
        {loading ? <LoadingView /> : (
          <>
            {/* Identity */}
            <Card>
              <Text style={s.cardTitle}>Informations personnelles</Text>
              {field('Code', details.studentCode || details.code)}
              {field('Classe', details.class || details.className)}
              {field('Date de naissance', details.dob || details.birthDate)}
              {field('Téléphone', details.phone || details.parentPhone)}
              {field('Email', details.email)}
              {field('Adresse', details.address)}
              {field('Parent / Tuteur', details.parentName || details.guardian)}
            </Card>

            {/* Payments */}
            {payments.length > 0 && (
              <Card style={{ marginTop: 12 }}>
                <Text style={s.cardTitle}>Historique des paiements</Text>
                {payments.slice(0, 5).map((p, i) => (
                  <View key={i} style={[s.detailRow, { borderBottomWidth: i < payments.length - 1 ? 0.5 : 0 }]}>
                    <View>
                      <Text style={s.detailLabel}>{p.date || p.paymentDate || '—'}</Text>
                      <Text style={s.detailValue}>{p.type || p.description || 'Paiement'}</Text>
                    </View>
                    <Pill
                      label={`${Number(p.amount || 0).toLocaleString()} HTG`}
                      color={T.mint}
                      bg={T.mintPale}
                    />
                  </View>
                ))}
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCREEN: ATTENDANCE
// ═══════════════════════════════════════════════════════════════════════════
function AttendanceScreen() {
  const { api } = useApp();
  const [stats, setStats]   = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [date, setDate]     = useState(new Date().toISOString().split('T')[0]);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const [statsRes, recRes] = await Promise.all([
        api('getAttendanceStats'),
        api('getAttendanceByDate', { date })
      ]);
      if (statsRes?.success) setStats(statsRes.data || statsRes);
      if (recRes?.success && Array.isArray(recRes.records || recRes.data)) {
        setRecords(recRes.records || recRes.data);
      }
    } catch (_) {}
    finally { setLoading(false); setRefreshing(false); }
  }, [api, date]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const statusColor = s => s === 'present' ? T.mint : s === 'absent' ? T.coral : T.gold;
  const statusLabel = s => s === 'present' ? 'Présent' : s === 'absent' ? 'Absent' : 'Retard';

  return (
    <ScrollView
      style={s.screen}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(true); }} tintColor={T.navy} />}
    >
      {loading ? <LoadingView /> : (
        <>
          {/* Stats */}
          {stats && (
            <View style={s.statsGrid}>
              <StatCard label="Présents" value={stats.presentCount || stats.present}    icon="✅" color={T.mint} />
              <StatCard label="Absents"  value={stats.absentCount || stats.absent}      icon="❌" color={T.coral} />
              <StatCard label="En retard" value={stats.lateCount || stats.late}         icon="⏰" color={T.gold} />
              <StatCard label="Taux présence" value={stats.rate ? `${stats.rate}%` : '—'} icon="📊" color={T.sky} />
            </View>
          )}

          {/* Date selector */}
          <SectionHeader title={`Présences — ${date}`} />

          {records.length === 0
            ? <EmptyState icon="📋" title="Aucune donnée" subtitle="Sélectionnez une autre date" />
            : records.map((r, i) => (
              <Card key={i} style={s.attRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.attName}>{r.studentName || r.name || '—'}</Text>
                  <Text style={s.attClass}>{r.class || r.className || '—'}</Text>
                </View>
                <Pill
                  label={statusLabel(r.status)}
                  color={statusColor(r.status)}
                  bg={statusColor(r.status) + '20'}
                />
              </Card>
            ))
          }
        </>
      )}
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCREEN: GRADES
// ═══════════════════════════════════════════════════════════════════════════
function GradesScreen() {
  const { api } = useApp();
  const [grades, setGrades]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery]     = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await api('getGrades', {});
        if (res?.success && Array.isArray(res.grades || res.data)) {
          setGrades(res.grades || res.data);
        }
      } catch (_) {}
      finally { setLoading(false); }
    })();
  }, []);

  const filtered = grades.filter(g => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      String(g.studentName || g.name || '').toLowerCase().includes(q) ||
      String(g.subject || '').toLowerCase().includes(q) ||
      String(g.class || g.className || '').toLowerCase().includes(q)
    );
  });

  const scoreColor = v => {
    const n = Number(v);
    if (isNaN(n)) return T.textLight;
    if (n >= 80) return T.mint;
    if (n >= 60) return T.gold;
    return T.coral;
  };

  return (
    <View style={{ flex: 1 }}>
      <SearchBar value={query} onChangeText={setQuery} placeholder="Élève, matière, classe…" style={{ margin: 16 }} />
      {loading ? <LoadingView /> : (
        <FlatList
          data={filtered}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => (
            <Card style={s.gradeRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.gradeName}>{item.studentName || item.name || '—'}</Text>
                <Text style={s.gradeSubject}>{item.subject || '—'} • {item.class || item.className || '—'}</Text>
                <Text style={s.gradeExam}>{item.examTitle || item.period || '—'}</Text>
              </View>
              <Text style={[s.gradeScore, { color: scoreColor(item.score || item.grade) }]}>
                {item.score ?? item.grade ?? '—'}
              </Text>
            </Card>
          )}
          ListEmptyComponent={<EmptyState icon="📊" title="Aucune note trouvée" />}
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCREEN: FINANCE
// ═══════════════════════════════════════════════════════════════════════════
function FinanceScreen() {
  const { api } = useApp();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery]       = useState('');

  const fetchData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const res = await api('getPayments', {});
      if (res?.success && Array.isArray(res.payments || res.data)) {
        setPayments(res.payments || res.data);
      }
    } catch (_) {}
    finally { setLoading(false); setRefreshing(false); }
  }, [api]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = payments.filter(p => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      String(p.studentName || p.name || '').toLowerCase().includes(q) ||
      String(p.type || p.description || '').toLowerCase().includes(q)
    );
  });

  const total = filtered.reduce((acc, p) => acc + Number(p.amount || 0), 0);

  return (
    <View style={{ flex: 1 }}>
      <SearchBar value={query} onChangeText={setQuery} placeholder="Élève ou type de paiement…" style={{ margin: 16 }} />
      {!loading && (
        <Card style={{ marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={s.textMid}>Total affiché</Text>
          <Text style={[s.statValue, { color: T.mint }]}>{total.toLocaleString('fr-HT')} HTG</Text>
        </Card>
      )}
      {loading ? <LoadingView /> : (
        <FlatList
          data={filtered}
          keyExtractor={(_, i) => String(i)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(true); }} tintColor={T.navy} />}
          renderItem={({ item }) => (
            <Card style={s.finRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.finName}>{item.studentName || item.name || '—'}</Text>
                <Text style={s.finMeta}>{item.type || item.description || '—'} • {item.date || item.paymentDate || '—'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.finAmount, { color: T.mint }]}>{Number(item.amount || 0).toLocaleString()} HTG</Text>
                <Pill
                  label={item.status || 'payé'}
                  color={item.status === 'pending' ? T.gold : T.mint}
                  bg={item.status === 'pending' ? T.goldPale : T.mintPale}
                />
              </View>
            </Card>
          )}
          ListEmptyComponent={<EmptyState icon="💳" title="Aucun paiement trouvé" />}
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCREEN: USERS (Staff)
// ═══════════════════════════════════════════════════════════════════════════
function UsersScreen() {
  const { api } = useApp();
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery]     = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await api('getAllAdminUsers');
        if (res?.success && Array.isArray(res.users || res.data)) {
          setUsers(res.users || res.data);
        }
      } catch (_) {}
      finally { setLoading(false); }
    })();
  }, []);

  const filtered = users.filter(u => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      String(u.name || u.Name || '').toLowerCase().includes(q) ||
      String(u.email || u.Email || '').toLowerCase().includes(q) ||
      String(u.role || u.Role || '').toLowerCase().includes(q)
    );
  });

  const roleColor = r => {
    const role = String(r || '').toUpperCase();
    if (role === 'ADMIN') return T.navy;
    if (role === 'TEACHER') return T.sky;
    if (role === 'STAFF') return T.gold;
    return T.textLight;
  };

  return (
    <View style={{ flex: 1 }}>
      <SearchBar value={query} onChangeText={setQuery} placeholder="Nom, email ou rôle…" style={{ margin: 16 }} />
      {loading ? <LoadingView /> : (
        <FlatList
          data={filtered}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => (
            <Card style={s.userRow}>
              <View style={[s.studentAvatar, { backgroundColor: roleColor(item.role || item.Role) + '22' }]}>
                <Text style={[s.studentAvatarTxt, { color: roleColor(item.role || item.Role) }]}>
                  {(item.name || item.Name || 'U')[0]}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.studentName}>{item.name || item.Name || '—'}</Text>
                <Text style={s.studentMeta}>{item.email || item.Email || '—'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Pill label={item.role || item.Role || '—'} color={roleColor(item.role || item.Role)} />
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.active !== false ? T.mint : T.coral, marginTop: 6 }} />
              </View>
            </Card>
          )}
          ListEmptyComponent={<EmptyState icon="👔" title="Aucun utilisateur trouvé" />}
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCREEN: TIMETABLE
// ═══════════════════════════════════════════════════════════════════════════
function TimetableScreen() {
  const { api } = useApp();
  const [slots, setSlots]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [day, setDay]         = useState(0);

  const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];

  useEffect(() => {
    (async () => {
      try {
        const res = await api('getTimetableData');
        if (res?.success && Array.isArray(res.slots || res.data)) {
          setSlots(res.slots || res.data);
        }
      } catch (_) {}
      finally { setLoading(false); }
    })();
  }, []);

  const daySlots = slots.filter(s => Number(s.dayIndex ?? s.day) === day);

  return (
    <View style={{ flex: 1 }}>
      {/* Day tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.dayTabs} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {DAYS.map((d, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => setDay(i)}
            style={[s.dayTab, day === i && s.dayTabActive]}
          >
            <Text style={[s.dayTabTxt, day === i && s.dayTabTxtActive]}>{d}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? <LoadingView /> : (
        <FlatList
          data={daySlots}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => (
            <Card style={s.timetableRow}>
              <View style={s.timetableTime}>
                <Text style={s.timetableTimeStart}>{item.startTime || item.StartTime || '—'}</Text>
                <View style={s.timetableTimeLine} />
                <Text style={s.timetableTimeEnd}>{item.endTime || item.EndTime || '—'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.timetableSubject}>{item.subject || item.Subject || '—'}</Text>
                <Text style={s.timetableMeta}>{item.className || item.ClassName || '—'}</Text>
                <Text style={s.timetableTeacher}>👤 {item.teacher || item.Teacher || '—'}</Text>
              </View>
            </Card>
          )}
          ListEmptyComponent={<EmptyState icon="🗓️" title={`Aucun cours ${DAYS[day]}`} />}
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCREEN: PROMOTION
// ═══════════════════════════════════════════════════════════════════════════
function PromotionScreen() {
  const { api } = useApp();
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [query, setQuery]             = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await api('getPromotionDecision', {});
        if (res?.success && Array.isArray(res.data || res.students)) {
          setEnrollments(res.data || res.students);
        }
      } catch (_) {}
      finally { setLoading(false); }
    })();
  }, []);

  const filtered = enrollments.filter(e => {
    if (!query) return true;
    const q = query.toLowerCase();
    return String(e.studentName || e.name || '').toLowerCase().includes(q);
  });

  const decisionColor = d => {
    if (!d) return T.textLight;
    const dl = d.toLowerCase();
    if (dl.includes('promu') || dl.includes('pass')) return T.mint;
    if (dl.includes('redouble') || dl.includes('fail')) return T.coral;
    return T.gold;
  };

  return (
    <View style={{ flex: 1 }}>
      <SearchBar value={query} onChangeText={setQuery} placeholder="Nom d'élève…" style={{ margin: 16 }} />
      {loading ? <LoadingView /> : (
        <FlatList
          data={filtered}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => (
            <Card style={s.studentRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.studentName}>{item.studentName || item.name || '—'}</Text>
                <Text style={s.studentMeta}>{item.class || item.className || '—'} • Moy: {item.average || item.moyenne || '—'}</Text>
              </View>
              <Pill
                label={item.decision || item.status || '—'}
                color={decisionColor(item.decision || item.status)}
                bg={decisionColor(item.decision || item.status) + '22'}
              />
            </Card>
          )}
          ListEmptyComponent={<EmptyState icon="🏆" title="Aucune donnée de promotion" />}
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCREEN: SETTINGS
// ═══════════════════════════════════════════════════════════════════════════
function SettingsScreen({ onLogout, onChangeSchool, schoolUrl }) {
  const { api, user } = useApp();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api('getSaaSSettings');
        if (res?.success) setSettings(res.data || res.settings || {});
      } catch (_) {}
      finally { setLoading(false); }
    })();
  }, []);

  const row = (icon, label, value, onPress) => (
    <TouchableOpacity onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <View style={s.settingsRow}>
        <Text style={s.settingsRowIcon}>{icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.settingsRowLabel}>{label}</Text>
          {value ? <Text style={s.settingsRowValue} numberOfLines={1}>{value}</Text> : null}
        </View>
        {onPress && <Text style={{ color: T.textLight, fontSize: 18 }}>›</Text>}
      </View>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={s.screen}>
      {/* Profile */}
      <Card>
        <View style={s.settingsProfile}>
          <View style={s.avatarCircleLg}>
            <Text style={s.avatarInitialLg}>{(user.name || 'U')[0]}</Text>
          </View>
          <View style={{ marginTop: 12, alignItems: 'center' }}>
            <Text style={s.settingsProfileName}>{user.name || '—'}</Text>
            <Text style={s.settingsProfileEmail}>{user.email || '—'}</Text>
            <Pill label={user.role || '—'} color={T.navy} />
          </View>
        </View>
      </Card>

      {/* School info */}
      <Card style={{ marginTop: 12 }}>
        <Text style={s.cardTitle}>École</Text>
        {row('🏫', 'Nom de l\'école', settings?.schoolName || settings?.orgName || '—')}
        {row('🔗', 'URL de déploiement', schoolUrl)}
        {row('🌐', 'Ouvrir le portail web', '', () => {
          if (schoolUrl && Linking) {
            Linking.openURL(schoolUrl).catch(() => {});
          }
        })}
        {row('📱', 'Version de l\'app', '1.0.0')}
      </Card>

      {/* Settings from backend */}
      {settings && (
        <Card style={{ marginTop: 12 }}>
          <Text style={s.cardTitle}>Configuration</Text>
          {row('🗓️', 'Année académique', settings.academicYear || settings.anneeAcademique || '—')}
          {row('💱', 'Devise', settings.currency || settings.devise || 'HTG')}
          {row('🌍', 'Langue', settings.language || settings.langue || 'Français')}
        </Card>
      )}

      {/* Actions */}
      <Card style={{ marginTop: 12 }}>
        <Text style={s.cardTitle}>Actions</Text>
        {row('🔄', 'Changer d\'école', '', onChangeSchool)}
        {row('🚪', 'Se déconnecter', '', () => {
          Alert.alert('Déconnexion', 'Voulez-vous vraiment vous déconnecter ?', [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Déconnecter', style: 'destructive', onPress: onLogout }
          ]);
        })}
      </Card>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BOTTOM TAB BAR
// ═══════════════════════════════════════════════════════════════════════════
const TABS = [
  { key: 'home',       label: 'Accueil',  icon: '🏠' },
  { key: 'students',   label: 'Élèves',   icon: '👥' },
  { key: 'attendance', label: 'Présences', icon: '📋' },
  { key: 'finance',    label: 'Finance',  icon: '💳' },
  { key: 'settings',   label: 'Réglages', icon: '⚙️' },
];

function TabBar({ active, onPress }) {
  return (
    <View style={s.tabBar}>
      {TABS.map(t => (
        <TouchableOpacity
          key={t.key}
          onPress={() => onPress(t.key)}
          style={s.tabItem}
          activeOpacity={0.7}
        >
          <Text style={[s.tabIcon, active === t.key && { transform: [{ scale: 1.18 }] }]}>
            {t.icon}
          </Text>
          <Text style={[s.tabLabel, active === t.key && s.tabLabelActive]}>
            {t.label}
          </Text>
          {active === t.key && <View style={s.tabIndicator} />}
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STACK NAVIGATOR (lightweight)
// ═══════════════════════════════════════════════════════════════════════════
function MainApp({ schoolUrl, schoolLogoInitial = '', user, onLogout, onChangeSchool }) {
  const [activeTab, setActiveTab] = useState('home');
  const [stack, setStack]         = useState(['home']);
  const [schoolName, setSchoolName] = useState('');
  const [schoolLogo, setSchoolLogo] = useState(schoolLogoInitial || '');

  // Fetch school name
  useEffect(() => {
    (async () => {
      try {
        const res = await apiCall(schoolUrl, 'getSaaSSettings', {}, user.token);
        if (res?.success) {
          const name = res.data?.schoolName || res.data?.orgName || res.data?.SCHOOL_NAME || '';
          if (name) { setSchoolName(name); store(KEYS.schoolName, name); }
          const logo = res.data?.schoolLogo || res.data?.SCHOOL_LOGO || res.data?.logoUrl || '';
          if (logo) { setSchoolLogo(logo); store(KEYS.schoolLogo, logo); }
        }
      } catch (_) {}
    })();
  }, [schoolUrl]);

  const api = useCallback(
    (action, params = {}) => apiCall(schoolUrl, action, params, user.token),
    [schoolUrl, user.token]
  );

  const navigate = useCallback((screen) => {
    if (TABS.find(t => t.key === screen)) {
      setActiveTab(screen);
      setStack([screen]);
    } else {
      setStack(prev => [...prev, screen]);
    }
  }, []);

  const goBack = useCallback(() => {
    setStack(prev => prev.length > 1 ? prev.slice(0, -1) : prev);
  }, []);

  const currentScreen = stack[stack.length - 1];

  const screenTitles = {
    home:               'Tableau de bord',
    students:           'Élèves',
    attendance:         'Présences',
    grades:             'Notes',
    finance:            'Finance',
    promotion:          'Promotion',
    timetable:          'Emploi du temps',
    users:              'Utilisateurs',
    'teacher-affectation': 'Affectation enseignants',
    settings:           'Paramètres',
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'home':                  return <DashboardScreen />;
      case 'students':              return <StudentsScreen />;
      case 'attendance':            return <AttendanceScreen />;
      case 'grades':                return <GradesScreen />;
      case 'finance':               return <FinanceScreen />;
      case 'promotion':             return <PromotionScreen />;
      case 'timetable':             return <TimetableScreen />;
      case 'users':                 return <UsersScreen />;
      case 'settings':              return <SettingsScreen onLogout={onLogout} onChangeSchool={onChangeSchool} schoolUrl={schoolUrl} />;
      default:                      return <EmptyState icon="🚧" title="Section en développement" subtitle={`Écran : ${currentScreen}`} />;
    }
  };

  const isTabScreen = TABS.find(t => t.key === currentScreen);

  return (
    <AppCtx.Provider value={{ api, user, navigate, goBack, schoolName, schoolUrl, schoolLogo }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: T.cream }}>
        <StatusBar barStyle="dark-content" backgroundColor={T.white} />

        {/* Header */}
        {isTabScreen ? (
          <View style={s.header}>
            <View>
              <Text style={s.headerTitle}>{screenTitles[currentScreen] || currentScreen}</Text>
              {schoolName ? <Text style={s.headerSchool}>{schoolName}</Text> : null}
            </View>
            <SchoolLogo size={38} />
          </View>
        ) : (
          <TopBar
            title={screenTitles[currentScreen] || currentScreen}
            onBack={stack.length > 1 ? goBack : null}
          />
        )}

        {/* Content */}
        <View style={{ flex: 1, backgroundColor: T.cream }}>
          {renderScreen()}
        </View>

        {/* Tab Bar */}
        <TabBar active={activeTab} onPress={(key) => { setActiveTab(key); setStack([key]); }} />
      </SafeAreaView>
    </AppCtx.Provider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [phase, setPhase]       = useState('loading'); // loading | setup | login | app
  const [pendingUrl, setPendingUrl] = useState(null); // URL recue via deep link

  // ── Interception deep link : eduhaiti://setup?url=...&name=... ────────────
  useEffect(() => {
    if (!Linking) return;

    // Gere le deep link si l'app etait deja ouverte
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    // Gere le deep link au premier lancement (app fermee)
    Linking.getInitialURL().then(url => {
      if (url) handleDeepLink(url);
    }).catch(() => {});

    return () => subscription?.remove();
  }, []);

  function handleDeepLink(url) {
    if (!url) return;
    // Ignorer les URLs http/https — les laisser au navigateur
    if (url.startsWith('http://') || url.startsWith('https://')) return;
    try {
      // Accepte : eduhaiti://setup?url=...&name=...
      const parsed = Linking ? Linking.parse(url) : null;
      if (!parsed) return;
      const { hostname, queryParams } = parsed;
      if (hostname !== 'setup' && !url.includes('/setup')) return;
      const gasUrl = queryParams?.url ? decodeURIComponent(queryParams.url) : '';
      const schoolN = queryParams?.name ? decodeURIComponent(queryParams.name) : '';
      if (!gasUrl || !gasUrl.startsWith('https://')) return;
      setPendingUrl({ gasUrl, schoolN });
    } catch(_) {}
  }
  const [schoolUrl, setSchoolUrl] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [user, setUser]         = useState(null);
  const [schoolLogo, setSchoolLogo] = useState('');

  // Restore session on launch
  useEffect(() => {
    (async () => {
      const [savedUrl, savedToken, savedRole, savedName, savedEmail, savedSchool, savedLogo] = await Promise.all([
        load(KEYS.schoolUrl),
        load(KEYS.token),
        load(KEYS.role),
        load(KEYS.name),
        load(KEYS.email),
        load(KEYS.schoolName),
        load(KEYS.schoolLogo),
      ]);

      if (!savedUrl) { setPhase('setup'); return; }
      setSchoolUrl(savedUrl);
      setSchoolName(savedSchool || '');
      // Restaurer le logo mis en cache
      // (sera rafraichi apres reconnexion)
      // Note: si un deep link est arrive pendant le chargement,
      // pendingUrl sera applique apres ce bloc via l'effet ci-dessous

      if (savedToken) {
        // Validate token
        try {
          const res = await apiCall(savedUrl, 'getViewerInfo', { token: savedToken }, savedToken);
          if (res?.success) {
            setUser({
              token: savedToken,
              role: res.role || savedRole || 'Staff',
              name: res.name || savedName || '',
              email: res.email || savedEmail || '',
              permissions: res.permissions || {}
            });
            setPhase('app');
            return;
          }
        } catch (_) {}
      }
      setPhase('login');
    })();
  }, []);

  // Applique le deep link des que la phase de chargement est terminee
  useEffect(() => {
    if (!pendingUrl || phase === 'loading') return;
    const { gasUrl, schoolN } = pendingUrl;
    setPendingUrl(null);
    // Valider l'URL puis passer directement au login
    (async () => {
      try {
        const res = await apiCall(gasUrl, 'ping');
        if (res && (res.success || res.status === 'ok' || res.status === 'online' || res.pong)) {
          await store(KEYS.schoolUrl, gasUrl);
          if (schoolN) await store(KEYS.schoolName, schoolN);
          setSchoolUrl(gasUrl);
          setSchoolName(schoolN || '');
          setUser(null);
          setPhase('login');
        }
      } catch(_) {}
    })();
  }, [pendingUrl, phase]);

  async function handleLogout() {
    await Promise.all([remove(KEYS.token), remove(KEYS.role), remove(KEYS.name), remove(KEYS.email)]);
    setUser(null);
    setPhase('login');
  }

  async function handleChangeSchool() {
    await Promise.all(Object.values(KEYS).map(k => remove(k)));
    setSchoolUrl('');
    setSchoolName('');
    setUser(null);
    setPhase('setup');
  }

  // Mettre a jour le logo quand il change (appele depuis MainApp apres fetch)
  function handleLogoUpdate(logo) {
    if (logo) setSchoolLogo(logo);  // eslint-disable-line no-unused-vars
  }

  if (phase === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: T.navy, justifyContent: 'center', alignItems: 'center' }}>
        <View style={s.splashLogo}>
          <Text style={{ fontSize: 40, color: T.white }}>E</Text>
        </View>
        <Text style={{ color: T.white, fontSize: 24, fontWeight: '700', marginTop: 20 }}>EduHaïti</Text>
        <Text style={{ color: T.textLight, fontSize: 14, marginTop: 8 }}>Système de Gestion Scolaire</Text>
        <ActivityIndicator color={T.gold} style={{ marginTop: 40 }} />
      </View>
    );
  }

  if (phase === 'setup') {
    return (
      <SetupScreen onDone={url => { setSchoolUrl(url); setPhase('login'); }} />
    );
  }

  if (phase === 'login') {
    return (
      <LoginScreen
        schoolUrl={schoolUrl}
        schoolName={schoolName}
        onLogin={userData => { setUser(userData); setPhase('app'); }}
        onChangeSchool={handleChangeSchool}
      />
    );
  }

  return (
    <MainApp
      schoolUrl={schoolUrl}
      schoolLogoInitial={schoolLogo}
      user={user}
      onLogout={handleLogout}
      onChangeSchool={handleChangeSchool}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  // ── Layout ──────────────────────────────────────────────────────────────
  screen: { flex: 1, backgroundColor: T.cream },

  // ── Card ────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: T.white,
    borderRadius: T.radius,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: T.navy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: { fontSize: 13, fontWeight: '700', color: T.textMid, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.6 },

  // ── Button ──────────────────────────────────────────────────────────────
  btn: { borderRadius: T.radiusSm, padding: 14, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },

  // ── Pill ────────────────────────────────────────────────────────────────
  pill: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  pillTxt: { fontSize: 11, fontWeight: '700' },

  // ── Input ───────────────────────────────────────────────────────────────
  input: {
    borderWidth: 1.5,
    borderColor: T.border,
    borderRadius: T.radiusSm,
    padding: 13,
    marginBottom: 14,
    color: T.textDark,
    backgroundColor: T.stone,
    fontSize: 14,
  },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: T.textMid, marginBottom: 6 },

  // ── Error ────────────────────────────────────────────────────────────────
  errorBox: { backgroundColor: T.coralPale, borderRadius: T.radiusSm, padding: 12, marginBottom: 12 },
  errorTxt: { color: T.coral, fontSize: 13, fontWeight: '500' },

  // ── Setup Screen ─────────────────────────────────────────────────────────
  setupContainer: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  setupBrand: { alignItems: 'center', marginBottom: 32 },
  setupLogo: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: T.navy, alignItems: 'center', justifyContent: 'center',
    shadowColor: T.navy, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 10,
  },
  setupLogoText: { fontSize: 36, fontWeight: '900', color: T.white },
  setupAppName: { fontSize: 28, fontWeight: '800', color: T.navy, marginTop: 14 },
  setupTagline: { fontSize: 13, color: T.textLight, marginTop: 4 },
  setupCard: { marginHorizontal: 0 },
  setupCardTitle: { fontSize: 18, fontWeight: '800', color: T.textDark, marginBottom: 6 },
  setupCardSub: { fontSize: 13, color: T.textMid, marginBottom: 20, lineHeight: 18 },
  setupFooter: { textAlign: 'center', color: T.textLight, fontSize: 12, marginTop: 24, lineHeight: 18 },

  // ── Login Screen ─────────────────────────────────────────────────────────
  loginContainer: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  schoolBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: T.white, borderRadius: T.radiusSm,
    padding: 12, marginBottom: 20,
    borderWidth: 1, borderColor: T.border,
  },
  schoolBadgeIcon: { fontSize: 24 },
  schoolBadgeName: { fontSize: 13, fontWeight: '700', color: T.textDark },
  schoolBadgeUrl: { fontSize: 11, color: T.textLight },
  changeSchoolBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: T.stone, borderRadius: 8 },
  changeSchoolTxt: { fontSize: 12, color: T.navy, fontWeight: '600' },
  loginCard: { marginHorizontal: 0 },
  loginTitle: { fontSize: 22, fontWeight: '800', color: T.textDark, marginBottom: 20 },
  modeTabs: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  modeTab: { flex: 1, padding: 10, borderRadius: T.radiusSm, backgroundColor: T.stone, alignItems: 'center' },
  modeTabActive: { backgroundColor: T.navy },
  modeTabTxt: { fontSize: 11, fontWeight: '700', color: T.textMid },
  modeTabTxtActive: { color: T.white },

  // ── Header ───────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: T.white,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: T.navy },
  headerSchool: { fontSize: 12, color: T.textLight, marginTop: 2 },
  headerLogo: { width: 38, height: 38, borderRadius: 12, backgroundColor: T.navy, alignItems: 'center', justifyContent: 'center' },
  headerLogoTxt: { fontSize: 18, fontWeight: '900', color: T.white },

  // ── TopBar ───────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: T.white, borderBottomWidth: 1, borderBottomColor: T.border,
  },
  topBarBack: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  topBarBackIcon: { fontSize: 28, color: T.navy, fontWeight: '300' },
  topBarTitle: { fontSize: 16, fontWeight: '700', color: T.navy },
  topBarSub: { fontSize: 12, color: T.textLight, marginTop: 2 },

  // ── Tab Bar ──────────────────────────────────────────────────────────────
  tabBar: {
    flexDirection: 'row',
    backgroundColor: T.white,
    borderTopWidth: 1,
    borderTopColor: T.border,
    paddingBottom: Platform.OS === 'ios' ? 20 : 8,
    paddingTop: 8,
    shadowColor: T.navy,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 10,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  tabIcon: { fontSize: 22, marginBottom: 2 },
  tabLabel: { fontSize: 10, color: T.textLight, fontWeight: '600' },
  tabLabelActive: { color: T.navy },
  tabIndicator: {
    position: 'absolute', bottom: -8, width: 4, height: 4,
    borderRadius: 2, backgroundColor: T.gold,
  },

  // ── Dashboard ─────────────────────────────────────────────────────────────
  welcomeBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    margin: 16, padding: 16,
    backgroundColor: T.navy, borderRadius: T.radius,
  },
  welcomeGreet: { fontSize: 18, fontWeight: '800', color: T.white },
  welcomeRole: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  avatarCircle: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: T.gold, alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 20, fontWeight: '800', color: T.white },
  avatarCircleLg: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: T.navy, alignItems: 'center', justifyContent: 'center',
  },
  avatarInitialLg: { fontSize: 32, fontWeight: '800', color: T.white },

  // ── Stats ────────────────────────────────────────────────────────────────
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8, marginBottom: 8 },
  statCard: {
    flex: 1, minWidth: (SW - 48) / 2,
    backgroundColor: T.white, borderRadius: T.radiusSm,
    padding: 14, borderLeftWidth: 3,
    shadowColor: T.navy, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  statIcon: { fontSize: 22, marginBottom: 6 },
  statValue: { fontSize: 22, fontWeight: '800', color: T.navy },
  statLabel: { fontSize: 11, color: T.textLight, marginTop: 4, fontWeight: '500' },

  // ── Quick Actions ─────────────────────────────────────────────────────────
  qaGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10, paddingBottom: 20 },
  qaItem: { width: (SW - 52) / 4, alignItems: 'center' },
  qaIcon: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: T.white, alignItems: 'center', justifyContent: 'center',
    shadowColor: T.navy, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
    marginBottom: 6,
  },
  qaIconTxt: { fontSize: 24 },
  qaLabel: { fontSize: 10, color: T.textMid, textAlign: 'center', fontWeight: '600' },

  // ── Section Header ────────────────────────────────────────────────────────
  sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: T.textDark },
  sectionSub: { fontSize: 12, color: T.textLight, marginTop: 2 },
  sectionAction: { fontSize: 13, color: T.sky, fontWeight: '600' },

  // ── Students ─────────────────────────────────────────────────────────────
  studentRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  studentAvatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: T.navyLight + '22', alignItems: 'center', justifyContent: 'center',
  },
  studentAvatarTxt: { fontSize: 18, fontWeight: '700', color: T.navy },
  studentName: { fontSize: 14, fontWeight: '700', color: T.textDark },
  studentMeta: { fontSize: 12, color: T.textLight, marginTop: 2 },

  // ── Detail ───────────────────────────────────────────────────────────────
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: T.border,
  },
  detailLabel: { fontSize: 12, color: T.textLight, fontWeight: '500' },
  detailValue: { fontSize: 13, color: T.textDark, fontWeight: '600', maxWidth: SW * 0.5, textAlign: 'right' },

  // ── Search ───────────────────────────────────────────────────────────────
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: T.white, borderRadius: T.radiusSm,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: T.border,
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, fontSize: 14, color: T.textDark },

  // ── Attendance ────────────────────────────────────────────────────────────
  attRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  attName: { fontSize: 14, fontWeight: '700', color: T.textDark },
  attClass: { fontSize: 12, color: T.textLight, marginTop: 2 },

  // ── Grades ────────────────────────────────────────────────────────────────
  gradeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  gradeName: { fontSize: 14, fontWeight: '700', color: T.textDark },
  gradeSubject: { fontSize: 12, color: T.textMid, marginTop: 2 },
  gradeExam: { fontSize: 11, color: T.textLight, marginTop: 2 },
  gradeScore: { fontSize: 24, fontWeight: '900' },

  // ── Finance ──────────────────────────────────────────────────────────────
  finRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  finName: { fontSize: 14, fontWeight: '700', color: T.textDark },
  finMeta: { fontSize: 12, color: T.textLight, marginTop: 2 },
  finAmount: { fontSize: 16, fontWeight: '800', marginBottom: 4 },

  // ── Users ────────────────────────────────────────────────────────────────
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  // ── Timetable ─────────────────────────────────────────────────────────────
  dayTabs: { backgroundColor: T.white, borderBottomWidth: 1, borderBottomColor: T.border, paddingVertical: 10 },
  dayTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 99, backgroundColor: T.stone },
  dayTabActive: { backgroundColor: T.navy },
  dayTabTxt: { fontSize: 13, fontWeight: '600', color: T.textMid },
  dayTabTxtActive: { color: T.white },
  timetableRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  timetableTime: { alignItems: 'center', minWidth: 46 },
  timetableTimeStart: { fontSize: 11, fontWeight: '700', color: T.navy },
  timetableTimeLine: { width: 1, flex: 1, backgroundColor: T.border, marginVertical: 3, minHeight: 20 },
  timetableTimeEnd: { fontSize: 11, color: T.textLight },
  timetableSubject: { fontSize: 14, fontWeight: '700', color: T.textDark },
  timetableMeta: { fontSize: 12, color: T.textMid, marginTop: 2 },
  timetableTeacher: { fontSize: 11, color: T.textLight, marginTop: 2 },

  // ── Settings ─────────────────────────────────────────────────────────────
  settingsProfile: { alignItems: 'center', paddingVertical: 8 },
  settingsProfileName: { fontSize: 18, fontWeight: '800', color: T.textDark, marginBottom: 4 },
  settingsProfileEmail: { fontSize: 13, color: T.textLight, marginBottom: 10 },
  settingsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: T.border,
  },
  settingsRowIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  settingsRowLabel: { fontSize: 14, fontWeight: '600', color: T.textDark },
  settingsRowValue: { fontSize: 12, color: T.textLight, marginTop: 2 },

  // ── Loading / Empty ───────────────────────────────────────────────────────
  loadingView: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 60 },
  loadingLabel: { fontSize: 14, color: T.textMid },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: T.textMid, textAlign: 'center' },
  emptySub: { fontSize: 13, color: T.textLight, textAlign: 'center', marginTop: 6 },

  // ── Splash ───────────────────────────────────────────────────────────────
  splashLogo: {
    width: 90, height: 90, borderRadius: 28,
    backgroundColor: T.gold, alignItems: 'center', justifyContent: 'center',
    shadowColor: T.gold, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 12,
  },

  // ── Misc ─────────────────────────────────────────────────────────────────
  textMid: { fontSize: 13, color: T.textMid, fontWeight: '600' },
});
