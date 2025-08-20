"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL!,
	process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// helper for dynamic sort order labels
function getSortOrderLabels(sort_by: "device_id" | "status" | "uptime") {
    switch (sort_by) {
        case "uptime":
            return { ascending: "Low to high", descending: "High to low" };
        case "device_id":
            return { ascending: "Low to high", descending: "High to low" };
        case "status":
            return { ascending: "Online first", descending: "Offline first" };
        default:
            return { ascending: "Ascending", descending: "Descending" };
    }
}

export default function Home() {
	const [devices, setDevices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState("");
    const [sort_by, setSortBy] = useState<"device_id" | "status" | "uptime">("device_id");
    const [sort_order, setSortOrder] = useState<"ascending" | "descending">("ascending");

    useEffect(() => {
        const fetchData = async () => {
            const { data, error } = await supabase
                .from("devices")
                .select("*");

            if (error) {
                console.error(error);
            } else {
                setDevices(data);
            }
            setLoading(false);
        };

        fetchData();
    }, []);

	function formatTimestamp(timestamp: any) {
		if (timestamp == null) {
			return null;
		}

		const difference_ms = Date.now() - new Date(timestamp).getTime();
		const difference_min = Math.floor(difference_ms / (1000 * 60));
		const difference_hour = Math.floor(difference_min / 60);
		const difference_day = Math.floor(difference_hour / 24);

		if (difference_day >= 1) {
			const hours = difference_hour % 24;
			const minutes = difference_min % 60;
			return `${difference_day}d ${hours}h ${minutes}m`;
		} else if (difference_hour >= 1) {
			const minutes = difference_min % 60;
			return `${difference_hour}h ${minutes}m`;
		} else {
			return `${difference_min}m`;
		}
	}

	function formatInterval(seconds: string) {
		const seconds_number = parseInt(seconds, 10);
		const days = Math.floor(seconds_number / 86400); // 24*3600
		const hours = Math.floor((seconds_number % 86400) / 3600);
		const minutes = Math.floor((seconds_number % 3600) / 60);
		const secs = seconds_number % 60;

		let result = '';
		if (days > 0) result += `${days}d `;
		if (hours > 0 || days > 0) result += `${hours}h `;
		if (minutes > 0 || hours > 0 || days > 0) result += `${minutes}m `;
		result += `${secs}s`;

		return result.trim();
	}

	function checkNull(value: any, suffix: string = "") {
		return value == null ? "-" : value + suffix;
	}

	function getDeviceStatus(device: any): string {
        const last_updated_time = new Date(device.last_updated).getTime();
        const now = Date.now();
        const max_allowed_delay = (parseInt(device.update_interval) + 60) * 1000;
        return (now - last_updated_time > max_allowed_delay) ? "Offline" : "Broadcasting";
    }

    // filter by device ID
    const filtered_devices = devices.filter((device) =>
        device.device_id?.toString().toLowerCase().includes(search.toLowerCase())
    );

    // sorting logic
	const sorted_devices = [...filtered_devices].sort((a, b) => {
		let result = 0;
		if (sort_by === "status") {
			const status_order: Record<"Broadcasting" | "Offline", number> = {
				Broadcasting: 0,
				Offline: 1,
			};
			const statusA = getDeviceStatus(a) as "Broadcasting" | "Offline";
			const status_b = getDeviceStatus(b) as "Broadcasting" | "Offline";
			result = status_order[statusA] - status_order[status_b];
		} else if (sort_by === "device_id") {
			const id_a = a.device_id ?? "";
			const id_b = b.device_id ?? "";
			result = id_a.localeCompare(id_b, undefined, { numeric: true });
		} else if (sort_by === "uptime") {
			const status_a = getDeviceStatus(a);
        	const status_b = getDeviceStatus(b);

			// Always put offline devices at the end
			if (status_a === "Offline" && status_b !== "Offline") return 1;
			if (status_a !== "Offline" && status_b === "Offline") return -1;
			if (status_a === "Offline" && status_b === "Offline") return 0;
				
			result = new Date(b.booted).getTime() - new Date(a.booted).getTime();
		}
		return sort_order === "ascending" ? result : -result;
	});

	const sort_order_labels = getSortOrderLabels(sort_by);

	// count device statuses
	const status_counts = {
		Broadcasting: 0,
		Offline: 0,
	};

	devices.forEach((device) => {
		const status = getDeviceStatus(device);
		status_counts[status as keyof typeof status_counts]++;
	});

	return (
		<div className="flex flex-col min-h-screen bg-gray-950">
			<div className="flex flex-col m-[80px] gap-10 overflow-x-auto justify-start items-start ">
				<div className="flex w-full h-24 gap-x-10 justify-between items-center mb-2">
					<div className="flex flex-1 h-full justify-center items-center bg-gray-900 rounded-md text-4xl gap-2">
						<span className="material-symbols-rounded text-green-400 !text-5xl pointer-events-none select-none">
							sensors
						</span>
						<span className="text-green-400">Broadcasting:</span>
						<span className="text-gray-200">{status_counts.Broadcasting}</span>
					</div>
					<div className="flex flex-1 h-full justify-center items-center bg-gray-900 rounded-md text-4xl gap-2">
						<span className="material-symbols-rounded text-red-400 !text-5xl pointer-events-none select-none">
							sensors_off
						</span>
						<span className="text-red-400">Offline:</span>
						<span className="text-gray-200">{status_counts.Offline}</span>
					</div>
				</div>
				<div className="w-full flex justify-between items-center gap-4">
					<h1 className="text-5xl font-bold text-white h-11 flex items-center">
						Devices
					</h1>
					<div className="flex items-center gap-4">
						<div className="relative flex items-center" style={{ minWidth: 180 }}>
							<span className="material-symbols-rounded absolute left-3 text-gray-500 pointer-events-none select-none">
								search
							</span>
							<input
								type="text"
								inputMode="numeric"
								pattern="[0-9]*"
								placeholder="Search by device ID"
								className="h-11 pl-10 pr-4 py-2 rounded-md bg-gray-900 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-none"
								value={search}
								onChange={e => {
									// Only allow numbers
									const val = e.target.value.replace(/[^0-9]/g, "");
									setSearch(val);
								}}
								style={{ minWidth: 180 }}
							/>
						</div>
						<select
							className="h-11 px-4 py-2 pr-8 rounded-md bg-gray-900 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-none"
							value={sort_by}
							onChange={e => setSortBy(e.target.value as "device_id" | "status" | "uptime")}
							style={{ minWidth: 180, backgroundPosition: 'right 1.5rem center' }}
						>
							<option value="device_id">Sort by device ID</option>
							<option value="status">Sort by status</option>
							<option value="uptime">Sort by uptime</option>
						</select>
						<select
							className="h-11 px-4 py-2 pr-8 rounded-md bg-gray-900 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-none"
							value={sort_order}
							onChange={e => setSortOrder(e.target.value as "ascending" | "descending")}
							style={{ minWidth: 150, backgroundPosition: 'right 1.5rem center' }}
						>
							<option value="ascending">{sort_order_labels.ascending}</option>
							<option value="descending">{sort_order_labels.descending}</option>
						</select>
					</div>
				</div>
				<div className="w-full overflow-x-auto rounded-md">
                    <table className="w-full text-left">
                        <thead className="bg-gray-900">
                            <tr>
                                <th className="px-4 py-3 text-gray-200">Status</th>
                                <th className="px-4 py-3 text-gray-200">Device ID</th>
                                <th className="px-4 py-3 text-gray-200">Firmware version</th>
                                <th className="px-4 py-3 text-gray-200">CPU temperature</th>
                                <th className="px-4 py-3 text-gray-200">WiFi SSID</th>
                                <th className="px-4 py-3 text-gray-200">WiFi RSSI</th>
                                <th className="px-4 py-3 text-gray-200">Uptime</th>
                                <th className="px-4 py-3 text-gray-200">Last updated</th>
                                <th className="px-4 py-3 text-gray-200">Update interval</th>
                            </tr>
                        </thead>
                        <tbody className="bg-gray-800 divide-y divide-gray-700">
							{loading ? (
								<tr>
									<td colSpan={9} className="px-4 py-6 text-center text-gray-400">
										Loading...
									</td>
								</tr>
							) : sorted_devices.length === 0 ? (
									<tr>
										<td colSpan={9} className="px-4 py-6 text-center text-gray-400">
											<span className="material-symbols-rounded align-middle text-2xl mr-2 select-none pointer-events-none">
												sentiment_dissatisfied
											</span>
											No results.
										</td>
									</tr>
								) : (
								sorted_devices.map((device) => {
									const device_status = getDeviceStatus(device);
									const is_device_broadcasting = device_status == "Broadcasting";
									const is_device_offline = device_status == "Offline";

									return (
										<tr key={device.device_id}>
											<td
												className={`px-4 py-3 flex items-center gap-2 ${is_device_broadcasting ? "text-green-400" : "text-red-400"}`}
											>
												<span className="material-symbols-rounded pointer-events-none select-none">
													{is_device_broadcasting ? "sensors" : "sensors_off"}
												</span>
												{device_status}
											</td>
											<td className="px-4 py-3 text-gray-500">
												{checkNull(device.device_id)}
											</td>
											<td className="px-4 py-3 text-gray-500">
												{checkNull(device.firmware_version)}
											</td>
											<td className="px-4 py-3 text-gray-500">
												{is_device_offline ? "-" : checkNull(device.cpu_temperature, "°C")}
											</td>
											<td className="px-4 py-3 text-gray-500">
												{is_device_offline ? "-" : checkNull(device.wifi_ssid)}
											</td>
											<td className="px-4 py-3 text-gray-500">
												{is_device_offline ? "-" : checkNull(device.wifi_rssi, " dBm")}
											</td>
											<td className="px-4 py-3 whitespace-nowrap text-gray-500">
												{(device.booted == null || is_device_offline) ? "-" : formatTimestamp(device.booted)}
											</td>
											<td className="px-4 py-3 whitespace-nowrap text-gray-500">
												{device.last_updated == null ? "-" : formatTimestamp(device.last_updated) + " ago"}
											</td>
											<td className="px-4 py-3 whitespace-nowrap text-gray-500">
												{device.update_interval == null ? "-" : formatInterval(device.update_interval)}
											</td>
										</tr>
									);
								})
							)}
						</tbody>
                    </table>
                </div>
			</div>
		</div>
	);
}
