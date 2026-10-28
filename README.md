# 💖 LoveVerse — Website & Gmail Notification System

A romantic website for **Naveen** with an integrated, secure **Gmail SMTP Visitor & Response Notification** system.

Whenever:
1. A visitor opens the website.
2. A visitor clicks **YES ❤️**.
3. A visitor clicks **NO 💔**.

An instant notification email is dispatched directly to your Gmail inbox.

---

## 📧 Email Notification Structure

- **Subject**: `LoveVerse Visitor Notification`

### 1. New Visitor
```
🔔 New LoveVerse Visitor

Visitor ID: [visitor ID]
Time: [time]
Source: [Instagram/Direct/Unknown]
Device: [device]
Browser: [browser]
Operating System: [OS]
Page: [page]
```

### 2. Visitor Clicks YES ❤️
```
💖 LoveVerse Response

Answer: YES ❤️
Visitor ID: [visitor ID]
Time: [time]
Source: [source]
Device: [device]
Browser: [browser]
```

### 3. Visitor Clicks NO 💔
```
💔 LoveVerse Response

Answer: NO 💔
Visitor ID: [visitor ID]
Time: [time]
Source: [source]
Device: [device]
Browser: [browser]
```

---

## 🔒 Privacy & Security

- **Zero WhatsApp**: WhatsApp notifications and Meta Cloud APIs are completely removed.
- **Privacy Safe**: Does not collect or attempt to obtain visitor Instagram usernames.
- **Anti-Spam**: Sliding window rate limiting prevents spam (max 5 emails/minute per visitor).
- **Safe App Password Handling**: Automatically removes spaces from Google 16-character App Passwords.

---

## ⚙️ Environment Variables (`.env`)

```env
PORT=3000
SMTP_USER=your_gmail_address@gmail.com
SMTP_PASS=your_16_character_app_password
```

---

## ☁️ Netlify Setup

In Netlify → **Site Configuration** → **Environment variables**, add these two variables:

| Variable Name | Required? | Value |
|---|---|---|
| `SMTP_USER` | Yes | Your Gmail address (e.g. `naveenchinnam982@gmail.com`) |
| `SMTP_PASS` | Yes | Your Google 16-character App Password (e.g. `abcd efgh ijkl mnop`) |

> [!NOTE]
> Generate your 16-character App Password at: [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
