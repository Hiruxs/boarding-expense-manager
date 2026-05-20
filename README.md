# 🏠 Boarding Expense Manager

A simple, free web app to split and track shared expenses among boarding members. Built with vanilla HTML/CSS/JS + Firebase Firestore.

## ✨ Features

- 👤 **Admin Panel**: Add/remove members, view all expenses, see balance summary
- 👥 **User Panel**: Add expense slots, select who to split with, live preview
- 💰 **Equal Split**: Money split equally among selected members
- 🔄 **Smart Settlement**: Automatically calculates who owes whom (simplifies mutual debts)
- 📱 **Mobile-friendly**: Works on phones, tablets, desktops
- 🆓 **100% Free**: No hosting costs, no database costs

---

## 📁 Project Structure

```
boarding-expense-manager/
├── index.html              # Landing page
├── admin.html              # Admin dashboard
├── user.html               # User expense entry
├── css/
│   └── style.css           # All styling
├── js/
│   ├── firebase-config.js  # ⚠️ Put your Firebase keys here
│   ├── admin.js            # Admin logic
│   └── user.js             # User logic
└── README.md
```

---

## 🚀 Quick Setup (3 steps)

### Step 1: Firebase Setup

1. Go to https://console.firebase.google.com
2. Click **Add project** → name it `boarding-expense` → disable Google Analytics → Create
3. Click **Build → Firestore Database → Create database**
   - Choose location closest to you (e.g. `asia-south1` for Sri Lanka)
   - Select **Start in test mode** → Create
4. Click ⚙️ **Project Settings → Your apps → `</>` Web**
   - Nickname: `boarding-web` → Register app
   - **COPY the `firebaseConfig` block** shown
5. Open `js/firebase-config.js` and **paste your config** replacing the placeholder:
   ```js
   const firebaseConfig = {
     apiKey: "AIzaSyB....",          // <-- yours
     authDomain: "boarding-expense.firebaseapp.com",
     projectId: "boarding-expense",
     storageBucket: "boarding-expense.appspot.com",
     messagingSenderId: "...",
     appId: "..."
   };
   ```
6. Change the admin password in the same file:
   ```js
   const ADMIN_PASSWORD = "your-secret-here";
   ```

### Step 2: Firestore Security Rules

1. Firebase Console → **Firestore Database → Rules**
2. Replace with:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if true;
       }
     }
   }
   ```
3. Click **Publish**

### Step 3: Deploy

#### Option A: Vercel (Recommended)

1. Push code to GitHub:
   ```bash
   cd boarding-expense-manager
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/boarding-expense-manager.git
   git push -u origin main
   ```
2. Go to https://vercel.com → **Add New Project**
3. Import your GitHub repo
4. Framework: **Other** → leave settings default → **Deploy**
5. Done! Your site is live at `https://boarding-expense-manager.vercel.app`

#### Option B: GitHub Pages

1. Push code to GitHub (same as above)
2. GitHub repo → **Settings → Pages**
3. Source: **Deploy from branch** → Branch: `main` → Folder: `/ (root)` → Save
4. Wait 1-2 minutes. Your site is at `https://YOUR_USERNAME.github.io/boarding-expense-manager/`

---

## 🧪 Testing Locally

You **cannot** just double-click `index.html` because Firebase requires HTTP (not file://). Use a simple local server:

**With Python:**
```bash
cd boarding-expense-manager
python -m http.server 8000
```
Open http://localhost:8000

**With VS Code:**
- Install the **Live Server** extension
- Right-click `index.html` → **Open with Live Server**

**With Node.js:**
```bash
npx serve
```

---

## 📖 How to Use

### Admin Workflow
1. Open the site → click **Admin**
2. Enter the password (set in `firebase-config.js`)
3. **Members tab**: Add boarding members (e.g. Kasun, Nimal, Saman)
4. **All Expenses tab**: See every expense ever added (with delete option)
5. **Balance Summary tab**:
   - Net balance per person
   - Simplified settlements (e.g. "Nimal pays Kasun Rs. 500")

### User Workflow
1. Open the site → click **User**
2. **Select payer** (who actually paid)
3. **Description** (e.g. "Groceries")
4. **Amount** (e.g. 1000)
5. **Tick** the members the money was spent on (include payer if their share counts)
6. See the **live preview** showing who owes what
7. Click **Save Expense**

### Example
- Kasun pays Rs. 1000 for groceries used by Kasun, Nimal, Saman
- Tick all 3 in the split
- Each person's share = Rs. 333.33
- Nimal owes Kasun Rs. 333.33, Saman owes Kasun Rs. 333.33
- Kasun's own share is already paid

---

## 🔒 Security Notes

This setup is suitable for **small private groups** (5-10 boarding members):

- ✅ Admin password protects the admin UI
- ⚠️ Firestore rules are open (anyone with the URL can read/write)
- ⚠️ Firebase API keys in client code are visible to anyone

For a small private boarding where you don't share the URL publicly, this is fine. If you want stricter security, consider:
- Firebase Authentication (proper login)
- Stricter Firestore rules tied to authenticated users
- App Check to prevent abuse

---

## 🛠️ Tech Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES Modules)
- **Backend**: None (serverless)
- **Database**: Firebase Firestore (NoSQL)
- **Hosting**: Vercel or GitHub Pages (static)

---

## 📝 License

Free to use, modify, and share. Built for personal/educational use.

---

## 🆘 Troubleshooting

**"Firebase is not defined" or imports fail**
- You're opening the file via `file://`. Use a local server (see Testing Locally).

**"Permission denied" errors in console**
- Check Firestore Rules — must allow read/write (see Step 2).

**"Quota exceeded" on Firebase**
- Free tier gives 50k reads + 20k writes per day — plenty for a boarding. Check Firebase Console → Usage.

**Site loads but data doesn't appear**
- Open browser DevTools (F12) → Console tab. Look for red errors. Usually a wrong Firebase config value.

**Forgot admin password**
- Edit `js/firebase-config.js`, change `ADMIN_PASSWORD`, redeploy.
