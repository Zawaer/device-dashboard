# Device Dashboard

A modern, real-time dashboard for monitoring a network of ESP32 devices deployed throughout a building. Instantly track live metrics, such as device status, uptime, WiFi signal strength, and more!

Live demo: https://device-dashboard-app.vercel.app/

<img width="2311" height="1072" alt="image" src="https://github.com/user-attachments/assets/fe4a2b83-2e5c-4f0f-bcdd-9d4790718347" />


## Features

- Real-time device metrics (uptime, CPU temperature, WiFi RSSI)
- Device status overview
- Historical charts for last 24 hours / daily averages
- Sorting and filtering of device
- Alerts for abnormal readings

## Prerequisites
- Node.js >= 18
- npm / yarn / pnpm / bun

## Setup

1. Clone the repository:

```bash
git clone https://github.com/Zawaer/device-dashboard.git
cd device-dashboard
```

2. Install dependencies:

```bash
npm install
# or yarn / pnpm / bun
```

3. Create a .env.local file in the root directory with your Supabase credentials:
```ini
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

4. Run the development server:
```bash
npm run dev
# or yarn dev / pnpm dev / bun dev
```

5. Open http://localhost:3000 in your browser.


## License

This project is licensed under the MIT License.
