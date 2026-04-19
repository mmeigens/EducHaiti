# EduHaïti — Application Mobile
## Système de Gestion Scolaire · React Native / Expo

---

## 🏗️ Architecture

```
App.js                 ← Application complète (single file)
├── SetupScreen        ← Saisie URL de l'école (première utilisation)
├── LoginScreen        ← Connexion staff / élève / parent
└── MainApp
    ├── DashboardScreen      ← Statistiques en temps réel
    ├── StudentsScreen       ← Liste + détail élèves
    ├── AttendanceScreen     ← Présences par date
    ├── GradesScreen         ← Notes et moyennes
    ├── FinanceScreen        ← Paiements et arriérés
    ├── PromotionScreen      ← Décisions de promotion
    ├── TimetableScreen      ← Emploi du temps
    ├── UsersScreen          ← Gestion du personnel
    └── SettingsScreen       ← Paramètres + déconnexion
```

---

## 🔑 Intégrité des données

Chaque école a sa propre URL de déploiement Google Apps Script.
L'application n'a **aucune URL codée en dur** — tout est configuré au premier lancement.

| Mécanisme | Détail |
|-----------|--------|
| Isolation tenants | Chaque URL → une école → un Google Sheet |
| Token storage | `expo-secure-store` (chiffrement AES-256) |
| Validation URL | Ping `?action=ping` avant de sauvegarder |
| Session | Token GAS validé via `getViewerInfo` au démarrage |
| Cross-tenant | Impossible — le token est lié à l'URL de l'école |

---

## 🚀 Installation

### Prérequis
- Node.js 18+
- Expo CLI : `npm install -g expo-cli`
- EAS CLI : `npm install -g eas-cli`

### Démarrage local (Expo Go)
```bash
cd EduHaitiApp
npm install
npx expo start
```
Puis scanner le QR code avec l'app **Expo Go** (Android/iOS).

### Build APK (pour distribution)
```bash
# Connexion Expo (compte gratuit)
eas login

# Configurer le projet
eas build:configure

# Build APK Android (distributable directement)
eas build --platform android --profile preview
```
Le build APK sera disponible en téléchargement sur expo.dev.

---

## 📡 API — Comment ça marche

L'app appelle le backend GAS via HTTP GET :

```
GET https://script.google.com/macros/s/{ID}/exec
  ?action=getAllStudents
  &token=SESSION_TOKEN
```

Actions disponibles utilisées :

| Écran | Action GAS |
|-------|-----------|
| Connexion staff | `attemptSheetLogin` |
| Connexion élève | `studentPortalLogin` |
| Connexion parent | `parentPortalLogin` |
| Tableau de bord | `getDashboardLiveStats` |
| Élèves | `getAllStudents`, `getStudent`, `getStudentPayments` |
| Présences | `getAttendanceStats`, `getAttendanceByDate` |
| Notes | `getGrades` |
| Finance | `getPayments` |
| Promotion | `getPromotionDecision` |
| Emploi du temps | `getTimetableData` |
| Personnel | `getAllAdminUsers` |
| Paramètres | `getSaaSSettings` |

---

## 🔧 Personnalisation par école

Aucune modification du code n'est nécessaire par école.
Chaque déploiement est configuré par l'URL saisie au premier lancement.

Pour distribuer à plusieurs écoles :
1. Construire **un seul APK**
2. Chaque directeur d'école saisit son URL lors de la première ouverture
3. Les données restent isolées sur le serveur de chaque école

---

## 📦 Structure des fichiers

```
EduHaitiApp/
├── App.js          ← Code source complet
├── app.json        ← Configuration Expo
├── eas.json        ← Configuration build EAS
├── package.json    ← Dépendances
├── babel.config.js ← Configuration Babel
└── assets/         ← Icônes (à ajouter)
    ├── icon.png    (1024×1024)
    └── splash.png  (recommandé)
```
