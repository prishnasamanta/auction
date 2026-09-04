# 🏏 Real-Time Multiplayer Auction & Squad Builder Arena

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)
[![Socket.io](https://img.shields.io/badge/Socket.io-v4.x-010101.svg?logo=socket.io)](https://socket.io/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

A state-of-the-art, high-performance **Real-Time Multiplayer Auction & Squad Builder Platform** designed for Cricket (IPL style) and Esports tournaments. Built with modern web technologies, glassmorphism aesthetics, live WebSockets, and zero-latency client synchronization.

---

## ✨ Features & Highlights

### ⚡ Live Bidding Engine
- **Synchronized WebSockets**: Powered by Socket.io for instant bid processing across all active room participants.
- **Dynamic Bidding Timers**: Automatic countdowns with customizable host controls for increment speeds and hammer timers.
- **Smart Bid Increments**: Automatically calculated bid steps based on current player valuation tiers.
- **Sold / Unsold & RTM Logic**: Live tracking of player sales, purse deductions, unsold player re-auctions, and squad allocations.

### 🎮 Esports Dashboard UI
- **Futuristic Glassmorphism Aesthetic**: Rich dark mode styling with vibrant HSL color palettes, subtle glowing borders, and micro-animations.
- **Responsive Layout**: Designed to look and function seamlessly across mobile devices, tablets, and desktop displays.
- **Real-Time Public Room Explorer**: Easily browse open rooms, view live host details, and join ongoing auctions with code verification.

### 💬 Interactive Chat & Custom Stickers
- **Live Room Feed**: Integrated real-time chat with host announcements and system event logs.
- **Floating Screen Reaction Pops**: Screen-wide floating sticker pops for high-octane bidding moments.
- **Zero-Server-Load Local Sticker Folder Uploads**: Upload custom sticker packs directly from your local device storage using in-memory Object URLs without consuming server bandwidth or disk space.

### 🧢 Playing XI Selector & Squad Analytics
- **Live Team Purse & Roster Trackers**: Instant feedback on remaining team budgets, slot counts, and team ratings.
- **Interactive Playing XI Builder**: Rule validation for team balance (Batters, Bowlers, Wicket-Keepers, All-Rounders, and Overseas player limits).
- **Dynamic Leaderboard Standings**: Interactive standings ranking team compositions by overall rating, spent purse, and squad completeness.

### ☁️ Cloud Persistence & Offline Resilience
- **Dual Persistence Architecture**: Real-time cloud sync with Firebase Firestore alongside automatic local in-memory fallback if offline.

---

## 🛠️ Technology Stack

| Tiers | Technology |
| :--- | :--- |
| **Frontend** | HTML5, JavaScript (ES6+ Native), Vanilla CSS3 (Custom Tokens & Glassmorphism) |
| **Backend** | Node.js, Express.js |
| **Real-time Networking** | Socket.io (WebSockets) |
| **Database / Sync** | Firebase Firestore / Realtime DB (Optional) with In-Memory Fallback |
| **Icons & Fonts** | Lucide Vector Icons, Google Fonts (Plus Jakarta Sans, Inter, JetBrains Mono) |

---

## 📁 Repository Structure

```
.
├── datasets/             # Pre-configured player pool JSON datasets (IPL, Custom Pools)
├── public/               # Static frontend assets
│   ├── client.js         # Client-side Socket.io handlers & UI logic
│   ├── index.html        # Single Page Application structure
│   ├── style.css         # Complete UI design system & CSS rules
│   └── favicon.ico       # Application icon
├── server.js             # Central Express & Socket.io auction server
├── package.json          # Node dependencies & run scripts
└── README.md             # Project documentation
```

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16.0.0 or higher recommended)
- [npm](https://www.npmjs.com/) (included with Node.js)

### Installation

1. **Clone the Repository**
   ```bash
   git clone https://github.com/prishnasamanta/auction.git
   cd auction
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Start the Local Development Server**
   ```bash
   npm start
   ```

4. **Access the Application**
   Open your browser and navigate to:
   - **Primary Application:** `http://localhost:3000`
   - **Secondary HTTP Listener:** `http://localhost:8001`

---

## 🔧 Environment & Configuration

The application automatically runs out of the box in **Local In-Memory Mode**. To enable cloud persistence with Firebase:

1. Create a Firebase Project on the [Firebase Console](https://console.firebase.google.com/).
2. Download your Firebase Admin Service Account JSON key.
3. Place the service account key in the project root directory or configure environment variables in `.env`:
   ```env
   PORT=3000
   FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
   ```

---

## 👥 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check out the [Issues Page](https://github.com/prishnasamanta/auction/issues).

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git checkout -b feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
