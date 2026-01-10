# 📈 ProTrader - Paper Trading Platform

A full-stack paper trading platform for practicing stock trading without real money. Built as a college project with professional-grade features including real-time market data, portfolio management, and premium subscription features.

![Node.js](https://img.shields.io/badge/Node.js-v18+-green)
![Express](https://img.shields.io/badge/Express-4.x-blue)
![MongoDB](https://img.shields.io/badge/MongoDB-8.x-green)

## ✨ Features

- **📊 Real-Time Market Data** - Live stock prices and market updates
- **💼 Portfolio Management** - Track your virtual investments
- **📈 Interactive Charts** - Professional-grade trading charts
- **🔐 User Authentication** - Secure login and registration
- **💳 Premium Features** - Advanced analytics with Razorpay integration
- **📱 Responsive Design** - Works on desktop and mobile devices

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- MongoDB (local or Atlas)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/trading-platform.git
   cd trading-platform
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   PORT=3000
   MONGODB_URI=your_mongodb_connection_string
   RAZORPAY_KEY_ID=your_razorpay_key
   RAZORPAY_KEY_SECRET=your_razorpay_secret
   ```

4. **Start the server**
   ```bash
   # With MongoDB
   npm start
   
   # Without MongoDB (demo mode)
   npm run dev-no-db
   ```

5. **Open your browser**
   
   Navigate to `http://localhost:3000`

## 📁 Project Structure

```
trading-platform/
├── css/                    # Stylesheets
├── js/                     # Frontend JavaScript
├── models/                 # MongoDB models
├── index.html              # Landing page
├── login.html              # Authentication page
├── dashboard-pro.html      # Main trading dashboard
├── portfolio.html          # Portfolio management
├── pricing.html            # Premium subscription plans
├── server.js               # Main server (with MongoDB)
├── server-no-db.js         # Server (without MongoDB)
└── package.json            # Dependencies
```

## 🛠️ Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript
- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose
- **Payment**: Razorpay Integration
- **APIs**: Real-time market data integration

## 📝 Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start production server |
| `npm run dev` | Start development server with nodemon |
| `npm run dev-no-db` | Start server without MongoDB |

## 🎓 Academic Project

This project was built as a college project to demonstrate full-stack web development skills including:
- RESTful API design
- Database management
- User authentication
- Payment gateway integration
- Responsive web design

## 📄 License

This project is licensed under the ISC License.

---

Made with ❤️ for academic purposes
