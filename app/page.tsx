"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Tooltip } from "react-tooltip";
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip as ChartTooltip,
    Legend,
    Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, ChartTooltip, Legend, Filler);
ChartJS.defaults.font.family = 'Inter';

// Helper to interpolate color between red, yellow, green
function getUptimeColor(percent: number) {
    // 0-50: red (#f87171) to yellow (#facc15), 50-100: yellow to green (#4ade80)
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    let r, g, b;
    if (percent <= 50) {
        // red to yellow
        const t = clamp(percent / 50, 0, 1);
        // #f87171 (248, 113, 113) to #facc15 (250, 204, 21)
        r = 248 + (250 - 239) * t;
        g = 113 + (204 - 68) * t;
        b = 113 + (21 - 68) * t;
    } else {
        // yellow to green
        const t = clamp((percent - 50) / 50, 0, 1);
        // #facc15 (250, 204, 21) to #4ade80 (74, 222, 128)
        r = 250 + (74 - 250) * t;
        g = 204 + (222 - 204) * t;
        b = 21 + (128 - 21) * t;
    }
    return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

// helper for dynamic sort order labels
function get_sort_order_labels(sort_by: "device_id" | "uptime" | "firmware_version" | "cpu_temperature" | "wifi_rssi") {
    switch (sort_by) {
        case "uptime":
        case "device_id":
        case "firmware_version":
        case "cpu_temperature":
            return { ascending: "Low to high", descending: "High to low" };
        case "wifi_rssi":
            return { ascending: "Weak to strong", descending: "Strong to weak" };
        default:
            return { ascending: "Ascending", descending: "Descending" };
    }
}


const TIME_RANGES = [
    { label: "Last 7 days", value: "7d" },
    { label: "Last 30 days", value: "30d" },
    { label: "Last 365 days", value: "1y" },
];

export default function Home() {
    // State for uptime history and selected range
    const [uptime_history, setUptimeHistory] = useState<{ day: string; average_uptime: number }[]>([]);
    const [selected_range, setSelectedRange] = useState<string>("7d");

    // Dummy values for summary metrics (replace with real logic later)
    const avg_cpu_temp = 37.2;
    const avg_wifi_rssi = -67;
    const latest_firmware_version = "1.0.1";

    // Calculate average uptime for selected range (from uptime_history)
    const global_uptime_percent =
        uptime_history.length > 0
            ? uptime_history.reduce((sum, row) => sum + (typeof row.average_uptime === 'number' ? row.average_uptime : 0), 0) / uptime_history.length
            : 0;

    const [devices, set_devices] = useState<any[]>([]);
    const [loading, set_loading] = useState(true);
    const [displayedUptime, setDisplayedUptime] = useState(0);



    const [search, set_search] = useState("");
    const [sort_by, set_sort_by] = useState<"device_id" | "uptime" | "firmware_version" | "cpu_temperature" | "wifi_rssi">("device_id");
    const [sort_order, set_sort_order] = useState<"ascending" | "descending">("ascending");
    const [online_first, set_online_first] = useState(true);

    // ...removed modal state...

    useEffect(() => {
        // Fetch devices (static-ish) from devices_list and enrich with the latest raw heartbeat per device
        const fetch_data = async () => {
            try {
                const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

                const [listRes, rawRes] = await Promise.all([
                    supabase
                        .from('devices_list')
                        .select('device_id, firmware_version, booted, update_interval, wifi_ssid')
                        .order('device_id', { ascending: true }),
                    supabase
                        .from('devices_raw')
                        .select('device_id, cpu_temperature, wifi_rssi, last_updated')
                        .gte('last_updated', cutoff7d)
                        .order('last_updated', { ascending: false })
                ]);

                if (listRes.error) throw listRes.error;
                if (rawRes.error) throw rawRes.error;

                const list = listRes.data || [];
                const raw = rawRes.data || [];

                // Build a map of latest heartbeat per device (raw is ordered desc by last_updated)
                const latestByDevice = new Map<number, any>();
                for (const r of raw) {
                    const id = typeof r.device_id === 'number' ? r.device_id : parseInt(r.device_id);
                    if (!latestByDevice.has(id)) {
                        latestByDevice.set(id, r);
                    }
                }

                // Merge devices_list rows with latest raw metrics
                const merged = list.map((d: any) => {
                    const id = typeof d.device_id === 'number' ? d.device_id : parseInt(d.device_id);
                    const latest = latestByDevice.get(id);
                    return {
                        device_id: d.device_id,
                        firmware_version: d.firmware_version,
                        booted: d.booted,
                        update_interval: d.update_interval,
                        wifi_ssid: d.wifi_ssid,
                        // latest metrics from raw (may be undefined if no heartbeat in 7d)
                        cpu_temperature: latest?.cpu_temperature ?? null,
                        wifi_rssi: latest?.wifi_rssi ?? null,
                        last_updated: latest?.last_updated ?? null,
                    };
                });

                set_devices(merged);
            } catch (err) {
                console.error(err);
                set_devices([]);
            } finally {
                set_loading(false);
            }
        };

        fetch_data();
    }, []);

    // ...removed modal open/close handlers...

    // ...removed modal data fetching effect...

    // ...removed modal series builder...

    // Animate the progress circle value when loading finishes
    useEffect(() => {
        let animationFrame: number;
        let startTimestamp: number | null = null;
        const duration = 500;
        const start = displayedUptime;
        const end = global_uptime_percent;

        function easeOutQuart(t: number) {
            return 1 - Math.pow(1 - t, 4);
        }

        function animate(timestamp: number) {
            if (startTimestamp === null) startTimestamp = timestamp;
            const elapsed = timestamp - startTimestamp;
            const linearProgress = Math.min(elapsed / duration, 1);
            const easedProgress = easeOutQuart(linearProgress);
            setDisplayedUptime(start + (end - start) * easedProgress);
            if (linearProgress < 1) {
                animationFrame = requestAnimationFrame(animate);
            } else {
                setDisplayedUptime(end);
            }
        }

        if (!loading) {
            animationFrame = requestAnimationFrame(animate);
        }
        return () => {
            if (animationFrame) cancelAnimationFrame(animationFrame);
        };
    }, [loading, global_uptime_percent]);


    useEffect(() => {
        // Example: fetch with time range filter (replace with real backend logic)
        const fetchUptimeHistory = async () => {
            // You should update this query to use the selected_range in your backend
            const { data, error } = await supabase
                .from('devices_aggregated')
                .select('day,average_uptime')
                .order('day', { ascending: true });
            if (!error && data) {
                // Filter data by selected_range (simulate for now)
                let filtered = data;
                const now = new Date();
                if (selected_range === "24h") {
                    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    filtered = data.filter((row: any) => new Date(row.day) >= cutoff);
                } else if (selected_range === "7d") {
                    const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    filtered = data.filter((row: any) => new Date(row.day) >= cutoff);
                } else if (selected_range === "30d") {
                    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    filtered = data.filter((row: any) => new Date(row.day) >= cutoff);
                } else if (selected_range === "1y") {
                    const cutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                    filtered = data.filter((row: any) => new Date(row.day) >= cutoff);
                }
                setUptimeHistory(filtered);
            }
        };
        fetchUptimeHistory();
    }, [selected_range]);

    function format_timestamp(timestamp: any) {
        if (timestamp == null) {
            return null;
        }

        const difference_ms = Date.now() - new Date(timestamp).getTime();
        const difference_min = Math.floor(difference_ms / (1000 * 60));
        const difference_hour = Math.floor(difference_min / 60);
        const difference_day = Math.floor(difference_hour / 24);

        let parts: string[] = [];
        if (difference_day > 0) parts.push(`${difference_day}d`);
        if (difference_hour > 0 || difference_day > 0) parts.push(`${difference_hour % 24}h`);
        if (difference_min > 0 || difference_hour > 0 || difference_day > 0) parts.push(`${difference_min % 60}m`);

        // Only add seconds if nothing else is present
        if (parts.length === 0) parts.push("0m");

        // Remove trailing zero units (e.g. "3d 5h 0m" => "3d 5h")
        while (parts.length > 1 && /^0[dhms]$/.test(parts[parts.length - 1])) {
            parts.pop();
        }

        return parts.join(" ");
    }

    function format_interval(seconds: string) {
        const seconds_number = parseInt(seconds, 10);
        const days = Math.floor(seconds_number / 86400); // 24*3600
        const hours = Math.floor((seconds_number % 86400) / 3600);
        const minutes = Math.floor((seconds_number % 3600) / 60);
        const secs = seconds_number % 60;

        let parts: string[] = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0 || days > 0) parts.push(`${hours}h`);
        if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
        if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

        // Remove trailing zero units (e.g. "3d 5h 0m" => "3d 5h")
        while (parts.length > 1 && /^0[dhms]$/.test(parts[parts.length - 1])) {
            parts.pop();
        }

        return parts.join(" ");
    }

    function check_null(value: any, suffix: string = "") {
        return value == null ? "-" : value + suffix;
    }

    function get_device_status(device: any): string {
        const now = Date.now();
        const interval = (typeof device.update_interval === 'number' ? device.update_interval : parseInt(device.update_interval)) || 1800;
        const max_allowed_delay = (interval + 60) * 1000; // grace 60s
        const last_updated_time = device?.last_updated ? new Date(device.last_updated).getTime() : 0;
        if (!last_updated_time || Number.isNaN(last_updated_time)) return "Offline";
        return (now - last_updated_time > max_allowed_delay) ? "Offline" : "Broadcasting";
    }

    // filter by device ID
    const filtered_devices = devices.filter((device) =>
        device.device_id !== undefined && device.device_id !== null && device.device_id.toString().toLowerCase().includes(search.toLowerCase())
    );

    // sorting logic
    function compareDevices(a: any, b: any) {
        let result = 0;
        if (sort_by === "device_id") {
            // device_id is int2 (number), so compare as numbers
            const id_a = typeof a.device_id === 'number' ? a.device_id : -1;
            const id_b = typeof b.device_id === 'number' ? b.device_id : -1;
            result = id_a - id_b;
        } else if (sort_by === "uptime") {
            // Sort by uptime or downtime, regardless of status
            const status_a = get_device_status(a);
            const status_b = get_device_status(b);
            let val_a = 0, val_b = 0;
            if (status_a !== "Offline") {
                val_a = a.booted ? Date.now() - new Date(a.booted).getTime() : 0;
            } else {
                val_a = a.last_updated
                    ? Date.now() - (new Date(a.last_updated).getTime() + ((typeof a.update_interval === 'number' ? a.update_interval : parseInt(a.update_interval)) * 1000))
                    : 0;
            }
            if (status_b !== "Offline") {
                val_b = b.booted ? Date.now() - new Date(b.booted).getTime() : 0;
            } else {
                val_b = b.last_updated
                    ? Date.now() - (new Date(b.last_updated).getTime() + ((typeof b.update_interval === 'number' ? b.update_interval : parseInt(b.update_interval)) * 1000))
                    : 0;
            }
            result = val_a - val_b;
        } else if (sort_by === "firmware_version") {
            result = (a.firmware_version ?? "").localeCompare(b.firmware_version ?? "", undefined, { numeric: true });
        } else if (sort_by === "cpu_temperature") {
            // cpu_temperature is int2 (number)
            result = (typeof a.cpu_temperature === 'number' ? a.cpu_temperature : parseInt(a.cpu_temperature) || 0) - (typeof b.cpu_temperature === 'number' ? b.cpu_temperature : parseInt(b.cpu_temperature) || 0);
        } else if (sort_by === "wifi_rssi") {
            // wifi_rssi is int2 (number)
            result = (typeof a.wifi_rssi === 'number' ? a.wifi_rssi : parseInt(a.wifi_rssi) || -999) - (typeof b.wifi_rssi === 'number' ? b.wifi_rssi : parseInt(b.wifi_rssi) || -999);
        }
        return sort_order === "ascending" ? result : -result;
    }

    let sorted_devices: any[] = [];
    if (online_first) {
        const online = filtered_devices.filter(d => get_device_status(d) === "Broadcasting").sort(compareDevices);
        const offline = filtered_devices.filter(d => get_device_status(d) === "Offline").sort(compareDevices);
        sorted_devices = [...online, ...offline];
    } else {
        sorted_devices = [...filtered_devices].sort(compareDevices);
    }

    const sort_order_labels = get_sort_order_labels(sort_by);

    // count device statuses
    const status_counts = {
        Broadcasting: 0,
        Offline: 0,
    };

    devices.forEach((device) => {
        const status = get_device_status(device);
        status_counts[status as keyof typeof status_counts]++;
    });


    // Reference values
    const ESP_AVG_CURRENT = 0.0266; // Amps
    const ESP_VOLTAGE = 5; // Volts
    const HOURS_PER_DAY = 24;

    // Calculate daily kWh
    const daily_kwh = devices.length * ESP_AVG_CURRENT * ESP_VOLTAGE * HOURS_PER_DAY / 1000;
    const daily_kwh_display = daily_kwh.toLocaleString("en-US", { maximumFractionDigits: 3 });

    // Find device with longest uptime (online)
    let longest_uptime_device: any = null;
    let longest_uptime = 0;
    let online_devices = devices.filter((d) => get_device_status(d) === "Broadcasting");
    let offline_devices = devices.filter((d) => get_device_status(d) === "Offline");
    online_devices.forEach((device) => {
        if (device.booted) {
            const uptime = Date.now() - new Date(device.booted).getTime();
            if (uptime > longest_uptime) {
                longest_uptime = uptime;
                longest_uptime_device = device;
            }
        }
    });

    // Find device that has been offline the longest (last_updated furthest in the past)
    let longest_downtime_device: any = null;
    let oldest_last_updated = Date.now();
    offline_devices.forEach((device) => {
        if (device.last_updated) {
            const last_updated_time = new Date(device.last_updated).getTime();
            if (last_updated_time < oldest_last_updated) {
                oldest_last_updated = last_updated_time;
                longest_downtime_device = device;
            }
        }
    });

    // Average CPU temperature (online only)
    // Dummy values for summary metrics (replace with real logic later)

    return (
        <>
            <div className="flex flex-col min-h-screen bg-white dark:bg-slate-900">
                <div className="flex flex-col items-start justify-start gap-6 m-8 overflow-x-auto">
                {/* New top row: Up, Longest Uptime, Avg WiFi, Avg Temp (each 1/4) */}
                <div className="flex w-full gap-x-6">
                    {/* Up devices */}
                    <div
                        className="flex items-center flex-1 min-w-0 p-5 border border-gray-700 rounded-lg bg-slate-800"
                        style={{ flexBasis: '25%', minHeight: 90 }}
                        data-tooltip-id="main-tooltip"
                        data-tooltip-content="Number of devices currently connected to WiFi"
                    >
                        <div className="relative flex items-center justify-center flex-shrink-0 ml-4 mr-9" style={{ width: 28, height: 28 }}>
                            <span className={"absolute w-15 h-15 rounded-full bg-green-400/20"} aria-hidden="true" />
                            <span className={"w-5 h-5 rounded-full bg-green-400 animate-pulse-brightness"} aria-hidden="true" />
                        </div>
                        <div className="flex flex-col items-start justify-center flex-1">
                            {loading ? (
                                <span className="block w-24 h-6 mb-1 bg-gray-700 rounded-lg animate-pulse" />
                            ) : (
                                <span className="text-3xl font-bold leading-none text-white">{status_counts.Broadcasting}</span>
                            )}
                            <span className="mt-1 text-base text-gray-300">Up devices</span>
                        </div>
                    </div>
                    {/* Longest uptime */}
                    <div
                        className="flex items-center flex-1 min-w-0 p-5 border border-gray-700 rounded-lg bg-slate-800"
                        style={{ flexBasis: '25%', minHeight: 90 }}
                        data-tooltip-id="main-tooltip"
                        data-tooltip-content="Device with the longest continuous uptime"
                    >
                        <div className="flex items-center justify-center flex-shrink-0 ml-3 mr-8" style={{ width: 28, height: 28 }}>
                            <span className="text-green-400 select-none material-symbols-rounded" style={{ fontSize: "4rem" }}>
                                power
                            </span>
                        </div>
                        <div className="flex flex-col items-start justify-center flex-1">
                            {loading ? (
                                <span className="block w-24 h-6 mb-1 bg-gray-700 rounded-lg animate-pulse" />
                            ) : longest_uptime_device ? (
                                <span className="font-bold leading-none">
                                    <span className="text-xl text-white align-middle">{longest_uptime_device.device_id !== undefined && longest_uptime_device.device_id !== null ? longest_uptime_device.device_id.toString() : "-"} · </span>
                                    <span className="text-xl text-white align-middle">{format_timestamp(longest_uptime_device.booted)}</span>
                                </span>
                            ) : (
                                <span className="text-base text-gray-300">-</span>
                            )}
                            <span className="mt-1 text-base text-gray-300 whitespace-nowrap">Longest uptime</span>
                        </div>
                    </div>
                    {/* Avg WiFi RSSI */}
                    <div
                        className="flex items-center flex-1 min-w-0 p-5 border border-gray-700 rounded-lg bg-slate-800"
                        style={{ flexBasis: '25%', minHeight: 90 }}
                        data-tooltip-id="main-tooltip"
                        data-tooltip-content="All-time average WiFi RSSI among all ESP32 devices"
                    >
                        <div className="flex items-center justify-center flex-shrink-0 ml-3 mr-8" style={{ width: 28, height: 28 }}>
                            <span className="text-blue-300 select-none material-symbols-rounded" style={{ fontSize: "3.5rem" }}>
                                wifi
                            </span>
                        </div>
                        <div className="flex flex-col items-start justify-center flex-1">
                            {loading ? (
                                <span className="block w-24 h-6 mb-1 bg-gray-700 rounded-lg animate-pulse" />
                            ) : (
                                <span className="mb-1 text-xl font-bold leading-none text-white">{avg_wifi_rssi} dBm</span>
                            )}
                            <span className="mt-1 text-base text-gray-300 whitespace-nowrap">Average WiFi RSSI</span>
                        </div>
                    </div>
                    {/* Avg CPU Temp */}
                    <div
                        className="flex items-center flex-1 min-w-0 p-5 border border-gray-700 rounded-lg bg-slate-800"
                        style={{ flexBasis: '25%', minHeight: 90 }}
                        data-tooltip-id="main-tooltip"
                        data-tooltip-content="All-time average CPU temperature among all ESP32 devices"
                    >
                        <div className="flex items-center justify-center flex-shrink-0 ml-3 mr-8" style={{ width: 28, height: 28 }}>
                            <span className="text-orange-300 select-none material-symbols-rounded" style={{ fontSize: "4rem" }}>
                                thermometer
                            </span>
                        </div>
                        <div className="flex flex-col items-start justify-center flex-1">
                            {loading ? (
                                <span className="block w-24 h-6 mb-1 bg-gray-700 rounded-lg animate-pulse" />
                            ) : (
                                <span className="mb-1 text-xl font-bold leading-none text-white">{avg_cpu_temp.toFixed(1)}°C</span>
                            )}
                            <span className="mt-1 text-base text-gray-300 whitespace-nowrap">Average CPU temperature</span>
                        </div>
                    </div>
                </div>
                {/* Second row: Down, Longest Downtime, Power, Latest Firmware (each 1/4) */}
                <div className="flex w-full gap-x-6">
                    {/* Down devices */}
                    <div
                        className="flex items-center flex-1 min-w-0 p-5 border border-gray-700 rounded-lg bg-slate-800"
                        style={{ flexBasis: '25%', minHeight: 90 }}
                        data-tooltip-id="main-tooltip"
                        data-tooltip-content="Number of devices currently not connected to WiFi and/or not powered"
                    >
                        <div className="relative flex items-center justify-center flex-shrink-0 ml-4 mr-9" style={{ width: 28, height: 28 }}>
                            <span className={"absolute w-15 h-15 rounded-full bg-red-400/20"} aria-hidden="true" />
                            <span className={"w-5 h-5 rounded-full bg-red-400 animate-pulse-brightness"} aria-hidden="true" />
                        </div>
                        <div className="flex flex-col items-start justify-center flex-1">
                            {loading ? (
                                <span className="block w-24 h-6 mb-1 bg-gray-700 rounded-lg animate-pulse" />
                            ) : (
                                <span className="text-3xl font-bold leading-none text-white">{status_counts.Offline}</span>
                            )}
                            <span className="mt-1 text-base text-gray-300">Down devices</span>
                        </div>
                    </div>
                    {/* Longest downtime */}
                    <div
                        className="flex items-center flex-1 min-w-0 p-5 border border-gray-700 rounded-lg bg-slate-800"
                        style={{ flexBasis: '25%', minHeight: 90 }}
                        data-tooltip-id="main-tooltip"
                        data-tooltip-content="Device with the longest downtime (since last boot)"
                    >
                        <div className="flex items-center justify-center flex-shrink-0 ml-3 mr-8" style={{ width: 28, height: 28 }}>
                            <span className="text-red-400 select-none material-symbols-rounded" style={{ fontSize: "4rem" }}>
                                power_off
                            </span>
                        </div>
                        <div className="flex flex-col items-start justify-center flex-1">
                            {loading ? (
                                <span className="block w-24 h-6 mb-1 bg-gray-700 rounded-lg animate-pulse" />
                            ) : longest_downtime_device ? (
                                <span className="font-bold leading-none">
                                    <span className="text-xl text-white align-middle">{longest_downtime_device.device_id !== undefined && longest_downtime_device.device_id !== null ? longest_downtime_device.device_id.toString() : "-"} · </span>
                                    <span className="text-xl text-white align-middle">{format_timestamp(longest_downtime_device.last_updated)}</span>
                                </span>
                            ) : (
                                <span className="text-base text-gray-300">-</span>
                            )}
                            <span className="mt-1 text-base text-gray-300 whitespace-nowrap">Longest downtime</span>
                        </div>
                    </div>
                    {/* Power consumption (1/4 width) */}
                    <div
                        className="flex items-center flex-1 min-w-0 p-5 border border-gray-700 rounded-lg bg-slate-800"
                        style={{ flexBasis: '25%', minHeight: 90 }}
                        data-tooltip-id="main-tooltip"
                        data-tooltip-content="Estimated daily power consumption of all ESP32 devices"
                    >
                        <div className="flex items-center justify-center flex-shrink-0 ml-3 mr-8" style={{ width: 28, height: 28 }}>
                            <span className="text-yellow-400 select-none material-symbols-rounded" style={{ fontSize: "4rem" }}>
                                energy_savings_leaf
                            </span>
                        </div>
                        <div className="flex flex-col items-start justify-center flex-1">
                            {loading ? (
                                <span className="block w-24 h-6 mb-1 bg-gray-700 rounded-lg animate-pulse" />
                            ) : (
                                <span className="mb-1 text-xl font-bold leading-none text-white">{daily_kwh_display} kWh</span>
                            )}
                            <span className="mt-1 text-base text-gray-300 whitespace-nowrap">Daily power consumption</span>
                        </div>
                    </div>
                    {/* Latest firmware version (1/4 width) */}
                    <div
                        className="flex items-center flex-1 min-w-0 p-5 border border-gray-700 rounded-lg bg-slate-800"
                        style={{ flexBasis: '25%', minHeight: 90 }}
                        data-tooltip-id="main-tooltip"
                        data-tooltip-content="Latest firmware version released"
                    >
                        <div className="flex items-center justify-center flex-shrink-0 ml-3 mr-8" style={{ width: 28, height: 28 }}>
                            <span className="text-purple-300 select-none material-symbols-rounded" style={{ fontSize: "4rem" }}>
                                memory
                            </span>
                        </div>
                        <div className="flex flex-col items-start justify-center flex-1">
                            {loading ? (
                                <span className="block w-24 h-6 mb-1 bg-gray-700 rounded-lg animate-pulse" />
                            ) : (
                                <span className="mb-1 text-xl font-bold leading-none text-white">{latest_firmware_version}</span>
                            )}
                            <span className="mt-1 text-base text-gray-300 whitespace-nowrap">Latest version</span>
                        </div>
                    </div>
                </div>
                {/* Fourth row: global uptime (bigger), big panel */}
                <div className="flex w-full mb-16 gap-x-6">
                    {/* Global average uptime progress circle (square, bigger, tooltip) */}
                    <div className="flex flex-col items-center justify-center min-w-0 border border-gray-700 bg-slate-800 rounded-xl" style={{ flexBasis: '0 0 320px', width: 320, height: 320, aspectRatio: '1/1', padding: '0' }}>
                        <span
                            data-tooltip-id="main-tooltip"
                            data-tooltip-content="All-time average uptime among all ESP32 devices"
                            className="flex flex-col items-center justify-center w-full h-full"
                        >
                            <div className="relative flex items-center justify-center" style={{ width: 220, height: 220 }}>
                                {/* SVG progress circle */}
                                <svg width="220" height="220" viewBox="0 0 220 220">
                                    <g transform="rotate(-90 110 110)">
                                        <circle
                                            cx="110" cy="110" r="100"
                                            stroke="#334155"
                                            strokeWidth="18"
                                            fill="none"
                                            className={loading ? 'animate-pulse' : ''}
                                        />
                                        <circle
                                            cx="110" cy="110" r="100"
                                            stroke={
                                                loading
                                                    ? getUptimeColor(0)
                                                    : getUptimeColor(displayedUptime)
                                            }
                                            strokeWidth="18"
                                            fill="none"
                                            strokeDasharray={2 * Math.PI * 100}
                                            strokeDashoffset={2 * Math.PI * 100 * (1 - (loading ? 0 : displayedUptime) / 100)}
                                            strokeLinecap="round"
                                        />
                                    </g>
                                    <text x="50%" y="50%" textAnchor="middle" dy=".3em" fontSize="2.7rem" fill="#fff" fontWeight="bold">
                                        {loading ? '' : displayedUptime.toFixed(1) + '%'}
                                    </text>
                                </svg>
                                {loading && (
                                    <span className="absolute block h-10 -translate-x-1/2 -translate-y-1/2 bg-gray-700 rounded-lg left-1/2 top-1/2 w-30 animate-pulse" style={{ zIndex: 2 }} />
                                )}
                            </div>
                            <span className="mt-6 text-lg text-gray-300">Average uptime
                                {selected_range === "7d" && " (last 7 days)"}
                                {selected_range === "30d" && " (last 30 days)"}
                                {selected_range === "1y" && " (last 365 days)"}
                            </span>
                        </span>
                    </div>
                    {/* Big panel (2/3) with padding, y-axis label, and time range dropdown */}
                    <div
                        className="flex flex-row bg-slate-800 rounded-xl min-h-[320px] mb-0 flex-1 border border-gray-700 px-8 py-8 items-stretch"
                        style={{ flexBasis: 'auto' }}
                    >
                        {/* Chart and controls */}
                        <div className="flex flex-col flex-1 h-full">
                            {/* Uptime title and time range dropdown */}
                            <div className="relative flex flex-row items-center w-full">
                                <span className="absolute right-0 flex items-center gap-2">
                                    <select
                                        className="px-3 py-2 text-base text-gray-200 rounded-lg cursor-pointer bg-slate-800 focus:outline-none focus:ring-0 focus:ring-green-500"
                                        value={selected_range}
                                        onChange={e => setSelectedRange(e.target.value)}
                                        style={{ minWidth: 120, height: 44, marginRight: 2 }}
                                    >
                                        {TIME_RANGES.map((range) => (
                                            <option key={range.value} value={range.value}>{range.label}</option>
                                        ))}
                                    </select>
                                </span>
                                <span className="mr-6 text-2xl font-extrabold text-gray-200">Uptime</span>
                            </div>
                            {uptime_history.length > 0 ? (
                                <div style={{ width: '100%', height: '100%', minHeight: 220, minWidth: 0, position: 'relative', flex: 1 }} className="flex items-center justify-center flex-1">
                                    <Line
                                        data={{
                                            labels: uptime_history.map((row) => {
                                                // Format date as Finnish style (e.g. 27.8. or 27.8.2025)
                                                const d = new Date(row.day);
                                                return d.getFullYear() !== new Date().getFullYear()
                                                    ? `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`
                                                    : `${d.getDate()}.${d.getMonth() + 1}.`;
                                            }),
                                            datasets: [
                                                {
                                                    label: 'Average uptime (%)',
                                                    data: uptime_history.map((row) => row.average_uptime),
                                                    borderColor: '#4ade80',
                                                    tension: 0.3,
                                                    pointRadius: 2,
                                                    clip: false,
                                                    fill: true,
                                                    backgroundColor: (context) => {
                                                        const ctx = context.chart.ctx;
                                                        const gradient = ctx.createLinearGradient(0, 0, 0, 200);
                                                        gradient.addColorStop(0, "#4ade80");
                                                        gradient.addColorStop(1, "transparent");
                                                        return gradient;
                                                    },
                                                },
                                            ],
                                        }}
                                        options={{
                                            responsive: true,
                                            maintainAspectRatio: false,
                                            interaction: {
                                                intersect: false,
                                                mode: 'index',
                                            },
                                            animation: {
                                                duration: 300,
                                            },
                                            plugins: {
                                                legend: { display: false },
                                                title: { display: true },
                                                tooltip: {
                                                    callbacks: {
                                                        label: function(context) {
                                                            return "Average uptime: " + context.parsed.y + "%";
                                                        }
                                                    },
                                                },
                                            },
                                            resizeDelay: 0,
                                            devicePixelRatio: 4,
                                            scales: {
                                                y: {
                                                    min: 0,
                                                    max: 100,
                                                    beginAtZero: true,
                                                    grace: 0,
                                                    offset: false,
                                                    ticks: {
                                                        stepSize: 20,
                                                        callback: function(value) {
                                                            return value + "%";
                                                        },
                                                    },
                                                },
                                            },
                                        }}
                                        style={{ position: 'absolute', inset: 0 }}
                                    />
                                </div>
                            ) : loading ? (
                                <div className="flex items-center justify-center w-full h-full">
                                    <div className="w-full mt-4 h-7/8 bg-gray-700/60 rounded-xl animate-pulse"/>
                                </div>
                            ) : (
                                <div className="flex items-center justify-center w-full h-full" style={{ transform: 'translateY(-10%)' }}>
                                    <span className="text-lg text-gray-400">No uptime history data.</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                
                {/* Devices title and controls */}
                <div className="flex items-center justify-between w-full gap-4">
                    <h1 className="flex items-center text-4xl font-bold text-white">
                        Device list
                    </h1>
                    <div className="flex items-center gap-4">
                        <div className="relative flex items-center" style={{ minWidth: 140, maxWidth: 220 }}>
                            <span className="absolute text-gray-500 select-none material-symbols-rounded left-3">
                                search
                            </span>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder="Search by device ID"
                                className="py-2 pl-10 pr-3 text-gray-200 border border-gray-700 shadow-none h-11 rounded-xl bg-slate-900 focus:outline-none focus:ring-2 focus:ring-green-400"
                                value={search}
                                onChange={e => {
                                    const val = e.target.value.replace(/[^0-9]/g, "");
                                    set_search(val);
                                }}
                                style={{ minWidth: 140, maxWidth: 220 }}
                            />
                        </div>
                        <div className="relative flex items-center" style={{ minWidth: 180 }}>
                            <span className="absolute text-gray-500 pointer-events-none select-none material-symbols-rounded left-3">
                                sort
                            </span>
                            <select
                                className="py-2 pl-10 pr-8 text-gray-200 border border-gray-700 shadow-none appearance-none cursor-pointer h-11 rounded-xl bg-slate-800 focus:outline-none focus:ring-2 focus:ring-green-400"
                                value={sort_by}
                                onChange={e => set_sort_by(e.target.value as any)}
                                style={{ minWidth: 180, backgroundPosition: 'right 1.5rem center' }}
                            >
                                <option value="device_id">Sort by device ID</option>
                                <option value="uptime">Sort by uptime</option>
                                <option value="firmware_version">Sort by firmware version</option>
                                <option value="cpu_temperature">Sort by temperature</option>
                                <option value="wifi_rssi">Sort by WiFi strength</option>
                            </select>
                        </div>
                        <div className="relative flex items-center" style={{ minWidth: 150 }}>
                            <span className="absolute text-gray-500 pointer-events-none select-none material-symbols-rounded left-3">
                                swap_vert
                            </span>
                            <select
                                className="py-2 pl-10 pr-8 text-gray-200 border border-gray-700 shadow-none appearance-none cursor-pointer h-11 rounded-xl bg-slate-800 focus:outline-none focus:ring-2 focus:ring-green-400"
                                value={sort_order}
                                onChange={e => set_sort_order(e.target.value as 'ascending' | 'descending')}
                                style={{ minWidth: 150, backgroundPosition: 'right 1.5rem center' }}
                            >
                                <option value="ascending">{sort_order_labels.ascending}</option>
                                <option value="descending">{sort_order_labels.descending}</option>
                            </select>
                        </div>
                        <label className="flex items-center gap-3 text-base text-gray-300 cursor-pointer select-none">
                            <span>Show online first</span>
                            <span className="relative inline-block h-6 align-middle select-none w-11">
                                <input
                                    type="checkbox"
                                    checked={online_first}
                                    onChange={e => set_online_first(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <span className="block h-6 transition-colors duration-200 rounded-full bg-slate-700 peer-checked:bg-green-400 w-11"></span>
                                <span className="absolute w-4 h-4 transition-transform duration-200 bg-white rounded-full shadow-md left-1 top-1 peer-checked:translate-x-5"></span>
                            </span>
                        </label>
                    </div>
                </div>
                {/* Device list */}
                <div className="flex flex-col w-full overflow-hidden border border-gray-700 rounded-xl">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center w-full py-20">
                            <span className="mb-4 text-5xl text-green-400 material-symbols-rounded animate-spin">
                                progress_activity
                            </span>
                            <span className="text-xl font-medium text-gray-300">Loading devices…</span>
                        </div>
                    ) : sorted_devices.length === 0 ? (
                        <div className="flex items-center justify-center w-full py-10 text-gray-400">
                            <span className="mr-2 text-2xl align-middle select-none material-symbols-rounded">
                                sentiment_dissatisfied
                            </span>
                            No results.
                        </div>
                    ) : (
                        sorted_devices.map((device, idx) => {
                            const device_status = get_device_status(device);
                            const is_device_broadcasting = device_status === "Broadcasting";
                            const is_device_offline = device_status === "Offline";
                            const status_color = is_device_broadcasting ? "text-green-400" : "text-red-400";
                            const circle_color = is_device_broadcasting ? "bg-green-400" : "bg-red-400";
                            const circle_bg_color = is_device_broadcasting ? "bg-green-400/20" : "bg-red-400/20";
                            const status_text = is_device_broadcasting ? "Up" : "Down";
                            const status_date = is_device_broadcasting
                                ? format_timestamp(device.booted)
                                : format_timestamp(
                                    device.last_updated
                                        ? new Date(new Date(device.last_updated).getTime() + ((typeof device.update_interval === 'number' ? device.update_interval : parseInt(device.update_interval)) * 1000))
                                        : null
                                );
                            const interval_text = device.update_interval == null ? "-" : format_interval(typeof device.update_interval === 'number' ? device.update_interval : parseInt(device.update_interval));
                            const temp_text = is_device_offline ? "-" : (device.cpu_temperature !== undefined && device.cpu_temperature !== null ? device.cpu_temperature.toString() + "°C" : "-");

                            return (
                                <div
                                    key={device.device_id?.toString?.() ?? device.device_id}
                                    className={
                                        "flex items-center w-full bg-slate-800 px-6 py-4 shadow-sm" +
                                        (idx !== sorted_devices.length - 1 ? " border-b border-gray-700" : "")
                                    }
                                    style={{ marginTop: 0, marginBottom: 0 }}
                                >
                                    {/* Status circle with glow effect */}
                                    <div className="relative flex items-center justify-center flex-shrink-0 mr-4" style={{ width: 40, height: 40 }}>
                                        <span
                                            className={`absolute w-12 h-12 rounded-full ${circle_bg_color}`}
                                            aria-hidden="true"
                                        />
                                        <span
                                            className={`w-4 h-4 rounded-full ${circle_color} animate-pulse-brightness`}
                                            aria-hidden="true"
                                        />
                                    </div>
                                    {/* Device info */}
                                    <div className="flex flex-col flex-none min-w-0 w-[250px] justify-center">
                                        <span
                                            className="font-normal leading-tight text-white truncate"
                                            style={{ fontSize: "22px" }}
                                        >
                                            {device.device_id !== undefined && device.device_id !== null ? device.device_id.toString() : "-"}
                                        </span>
                                        <span className="flex items-center gap-2 mt-0.5 mb-0.5" style={{ fontSize: "16px" }}>
                                            <span className={`${status_color} font-medium`}>{status_text}</span>
                                            <span
                                                className="select-none"
                                                style={{
                                                    fontSize: "0.4em",
                                                    color: "#9ca3af",
                                                    display: "inline-block",
                                                    verticalAlign: "middle",
                                                    position: "relative",
                                                    top: "1px",
                                                }}
                                            >
                                                ●
                                            </span>
                                            <span className="text-gray-400">{status_date ?? "-"}</span>
                                        </span>
                                    </div>
                                    {/* Metrics grid*/}
                                    <div className="grid grid-cols-5 gap-26 min-w-[580px] items-center ml-auto">
                                        {/* RSSI */}
                                        <div
                                            className="flex items-center gap-3 w-[100px]"
                                            data-tooltip-id="main-tooltip"
                                            data-tooltip-content="WiFi signal strength (RSSI)"
                                        >
                                            {/* Only show faded wifi icon if not offline */}
                                            {!is_device_offline && (
                                                <span className="absolute flex-shrink-0 w-6 text-xl text-center select-none material-symbols-rounded text-gray-400/30">
                                                    wifi
                                                </span>
                                            )}
                                            {/* Overlay the colored/active wifi icon */}
                                            <span className="relative flex-shrink-0 w-6 text-xl text-center text-gray-400 select-none material-symbols-rounded">
                                                {is_device_offline
                                                    ? "wifi_off"
                                                    : Number(device.wifi_rssi) >= -55
                                                        ? "wifi"
                                                        : Number(device.wifi_rssi) > -75
                                                            ? "wifi_2_bar"
                                                            : "wifi_1_bar"}
                                            </span>
                                            <span className="text-base text-gray-400">
                                                {is_device_offline ? "-" : (device.wifi_rssi !== undefined && device.wifi_rssi !== null ? device.wifi_rssi.toString() + " dBm" : "-")}
                                            </span>
                                        </div>
                                        {/* CPU temperature */}
                                        <div
                                            className="flex items-center gap-1 w-[100px]"
                                            data-tooltip-id="main-tooltip"
                                            data-tooltip-content="CPU Temperature"
                                        >
                                            <span
                                                className={
                                                    "material-symbols-rounded text-xl select-none flex-shrink-0 w-6 text-center " +
                                                    (
                                                        temp_text === "-" 
                                                            ? "text-gray-400"
                                                            : (typeof device.cpu_temperature === 'number' ? device.cpu_temperature : parseInt(device.cpu_temperature)) >= 55 || (typeof device.cpu_temperature === 'number' ? device.cpu_temperature : parseInt(device.cpu_temperature)) <= 15
                                                                ? "text-red-400"
                                                                : "text-gray-400"
                                                    )
                                                }
                                            >
                                                thermometer
                                            </span>
                                            <span
                                                className={
                                                    "text-base " +
                                                    (
                                                        temp_text === "-" 
                                                            ? "text-gray-400"
                                                            : (typeof device.cpu_temperature === 'number' ? device.cpu_temperature : parseInt(device.cpu_temperature)) >= 55 || (typeof device.cpu_temperature === 'number' ? device.cpu_temperature : parseInt(device.cpu_temperature)) <= 10
                                                                ? "text-red-400"
                                                                : "text-gray-400"
                                                    )
                                                }
                                            >
                                                {temp_text}
                                            </span>
                                        </div>
                                        {/* Last updated */}
                                        <div
                                            className="flex items-center gap-2 w-[100px]"
                                            data-tooltip-id="main-tooltip"
                                            data-tooltip-content="The last time this device sent a status update"
                                        >
                                            <span className="flex-shrink-0 w-6 text-xl text-center text-gray-400 select-none material-symbols-rounded">
                                                schedule
                                            </span>
                                            <span className="block w-full text-base text-left text-gray-400">
                                                {device.last_updated ? format_timestamp(device.last_updated) + " ago" : "-"}
                                            </span>
                                        </div>
                                        {/* Update interval */}
                                        <div
                                            className="flex items-center gap-2 w-[100px]"
                                            data-tooltip-id="main-tooltip"
                                            data-tooltip-content="How often this device is configured to send status updates"
                                        >
                                            <span className="flex-shrink-0 w-6 text-xl text-center text-gray-400 select-none material-symbols-rounded">
                                                update
                                            </span>
                                            <span className="block w-full text-base text-left text-gray-400">
                                                {interval_text}
                                            </span>
                                        </div>
                                        {/* Firmware version */}
                                        <div
                                            className="flex items-center gap-2 w-[100px]"
                                            data-tooltip-id="main-tooltip"
                                            data-tooltip-content="The current firmware version running on this device"
                                        >
                                            <span className="flex-shrink-0 w-6 text-xl text-center text-gray-400 select-none material-symbols-rounded">
                                                memory
                                            </span>
                                            <span className="block w-full text-base text-left text-gray-400">
                                                {device.firmware_version ?? "-"}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
                {/* List footer: count */}
                {!loading && (
                    <div className="w-full text-sm text-gray-400 text-left">
                        Showing {sorted_devices.length} out of {devices.length} devices
                    </div>
                )}
                </div>
                <Tooltip
                    id="main-tooltip"
                    place="top"
                    style={{
                        backgroundColor: "#23293a",
                        color: "#e5e7eb",
                        borderRadius: "12px",
                        fontSize: "14px",
                        padding: "8px 14px",
                        boxShadow: "0 4px 24px 0 rgba(0,0,0,0.25)",
                        fontWeight: 500,
                        letterSpacing: "0.01em",
                        zIndex: 50,
                        whiteSpace: "pre-line",
                        maxWidth: "220px",
                    }}
                    delayShow={300}
                />
                {/* modal removed */}
            </div>
        </>
    );
}
