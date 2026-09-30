# 🔧 Chatbot Not Showing - Troubleshooting Guide

## 🎯 Quick Fix Steps

### Step 1: Open Test Page
1. Open `chatbot-test.html` in your browser
2. Check all status indicators
3. Click "Test Chatbot" button
4. Click "Check Backend" button

This will tell you exactly what's wrong!

---

## 🔍 Common Issues & Solutions

### Issue 1: Chat Button Not Visible ❌

**Symptoms:**
- No floating button in bottom-right corner
- Page loads but no chatbot

**Solutions:**

**A. Check File Paths**
```html
<!-- Make sure these are in your HTML: -->
<link rel="stylesheet" href="css/chatbot-widget.css">
<script src="js/chatbot-widget.js"></script>
```

**B. Check Files Exist**
- Open browser console (F12)
- Look for 404 errors
- Make sure `css/chatbot-widget.css` exists
- Make sure `js/chatbot-widget.js` exists

**C. Check CSS Loaded**
- Open browser console (F12)
- Type: `document.querySelector('.chatbot-toggle')`
- Should return an element, not `null`

---

### Issue 2: Button Visible But Not Working ⚠️

**Symptoms:**
- Button appears but nothing happens when clicked
- No chat window opens

**Solutions:**

**A. Check JavaScript Console**
- Press F12 to open developer tools
- Go to "Console" tab
- Look for red error messages
- Share the error message for help

**B. Check Widget Initialized**
- Open console (F12)
- Type: `window.chatbot`
- Should show ChatbotWidget object
- If `undefined`, JavaScript didn't load

---

### Issue 3: Backend Connection Error 🔌

**Symptoms:**
- Chat opens but shows error when sending message
- "Make sure the chatbot server is running"

**Solutions:**

**A. Start Ollama**
```bash
# Terminal 1
ollama serve
```
Keep this running!

**B. Start Backend**
```bash
# Terminal 2
cd chatbot-backend
start-nodejs.bat
```

**C. Check Backend Running**
- Open browser
- Go to: `http://localhost:3001/health`
- Should see: `{"status":"ok",...}`
- If error, backend is not running

---

### Issue 4: Wrong Page Open 📄

**Symptoms:**
- Chatbot works on some pages but not others

**Solution:**

Make sure you're opening a page with the chatbot integrated:
- ✅ `index.html` - Has chatbot
- ✅ `dashboard-pro.html` - Has chatbot
- ✅ `chatbot-test.html` - Test page
- ✅ `chatbot-demo.html` - Demo page
- ❌ `dashboard.html` - May not have chatbot
- ❌ `login.html` - May not have chatbot

---

## 🧪 Step-by-Step Debugging

### Step 1: Open Test Page
```
1. Open chatbot-test.html in browser
2. Check all green checkmarks ✅
3. If any red ❌, that's your problem
```

### Step 2: Check Browser Console
```
1. Press F12
2. Click "Console" tab
3. Look for errors (red text)
4. Common errors:
   - "Failed to load resource" = File not found
   - "Uncaught ReferenceError" = JavaScript error
   - "CORS error" = Backend not configured
```

### Step 3: Check Network Tab
```
1. Press F12
2. Click "Network" tab
3. Refresh page
4. Look for:
   - chatbot-widget.css (should be 200 OK)
   - chatbot-widget.js (should be 200 OK)
   - If 404, files are missing or path is wrong
```

### Step 4: Check Element
```
1. Press F12
2. Click "Elements" tab
3. Press Ctrl+F
4. Search for: chatbot-toggle
5. Should find the button element
6. If not found, JavaScript didn't run
```

---

## 📋 Checklist

Before asking for help, verify:

- [ ] Files exist:
  - [ ] `css/chatbot-widget.css`
  - [ ] `js/chatbot-widget.js`
- [ ] HTML includes:
  - [ ] `<link rel="stylesheet" href="css/chatbot-widget.css">`
  - [ ] `<script src="js/chatbot-widget.js"></script>`
- [ ] Browser console shows no errors (F12)
- [ ] Ollama is running (`ollama serve`)
- [ ] Backend is running (`start-nodejs.bat`)
- [ ] Opening correct page (`index.html` or `dashboard-pro.html`)

---

## 🎯 Quick Tests

### Test 1: Check Files
```bash
# In project root
dir css\chatbot-widget.css
dir js\chatbot-widget.js
```
Both should exist!

### Test 2: Check Backend
```bash
# In browser, go to:
http://localhost:3001/health
```
Should show: `{"status":"ok",...}`

### Test 3: Check Widget
```javascript
// In browser console (F12):
window.chatbot
```
Should show: `ChatbotWidget {...}`

### Test 4: Check Button
```javascript
// In browser console (F12):
document.getElementById('chatbotToggle')
```
Should show: `<button class="chatbot-toggle"...>`

---

## 🔧 Manual Fix

If nothing works, try the **minimal widget**:

1. Open `chatbot-widget-minimal.html`
2. Copy ALL content
3. Paste at bottom of your HTML page (before `</body>`)
4. Save and refresh

This is a single-file solution that should always work!

---

## 📞 Still Not Working?

### Collect This Information:

1. **Which page are you opening?**
   - Example: `index.html`

2. **Browser console errors?** (F12 → Console)
   - Copy any red error messages

3. **Network tab status?** (F12 → Network)
   - Are CSS/JS files loading? (200 OK or 404?)

4. **Backend running?**
   - Can you access `http://localhost:3001/health`?

5. **Test page results?**
   - Open `chatbot-test.html`
   - What do the status checks show?

---

## 🎉 Success Indicators

Chatbot is working if:
- ✅ Floating button visible in bottom-right
- ✅ Button has gradient blue color
- ✅ Clicking button opens chat window
- ✅ Chat window has "ProTrader AI" header
- ✅ Can type in input field
- ✅ Sending message shows typing indicator
- ✅ Bot responds (if backend is running)

---

## 🚀 Most Common Solution

**90% of the time, the issue is:**

1. **Files not in right place**
   - Make sure `css/chatbot-widget.css` exists
   - Make sure `js/chatbot-widget.js` exists

2. **Wrong page open**
   - Use `index.html` or `dashboard-pro.html`
   - Or use `chatbot-test.html` for testing

3. **Backend not running**
   - Start Ollama: `ollama serve`
   - Start backend: `cd chatbot-backend && start-nodejs.bat`

---

**Try opening `chatbot-test.html` first - it will diagnose the problem for you!** 🎯
