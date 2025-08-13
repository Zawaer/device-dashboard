"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL!,
	process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Home() {
	const [devices, setDevices] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);

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
		console.log(timestamp);

		const diffMs = Date.now() - new Date(timestamp).getTime();
		const diffMin = Math.floor(diffMs / (1000 * 60));
		const diffHr = Math.floor(diffMin / 60);
		const diffDay = Math.floor(diffHr / 24);

		if (diffDay >= 1) {
			const hours = diffHr % 24;
			const minutes = diffMin % 60;
			return `${diffDay}d ${hours}h ${minutes}m`;
		} else if (diffHr >= 1) {
			const minutes = diffMin % 60;
			return `${diffHr}h ${minutes}m`;
		} else {
			return `${diffMin}m`;
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
		const lastUpdatedTime = new Date(device.last_updated).getTime();
		const now = Date.now();

		// convert interval + 60s to ms
		const maxAllowedDelay = (parseInt(device.update_interval) + 60) * 1000;

		if (now - lastUpdatedTime > maxAllowedDelay) {
			return "Offline";
		}

		return device.is_broadcasting ? "Broadcasting" : "Idle";
	}

	const sorted_devices_by_status = [...devices].sort((device_a, device_b) => {
		const status_order: Record<"Broadcasting" | "Idle" | "Offline", number> = {
			Broadcasting: 0,
			Idle: 1,
			Offline: 2,
		};

		const status_a = getDeviceStatus(device_a) as "Broadcasting" | "Idle" | "Offline";
		const status_b = getDeviceStatus(device_b) as "Broadcasting" | "Idle" | "Offline";

		if (status_order[status_a] !== status_order[status_b]) {
			return status_order[status_a] - status_order[status_b];
		}

		return new Date(device_a.last_updated).getTime() - new Date(device_b.last_updated).getTime();
	});

	const sorted_devices_by_room_id = [...devices].sort((device_a, device_b) => {
		const device_id_a = device_a.device_id ?? "";
		const device_id_b = device_b.device_id ?? "";

		return parseInt(device_id_a) - parseInt(device_id_b);
	});

	return (
		<div className="flex flex-col min-h-screen bg-gray-950">
			<div className="flex flex-col m-[80px] justify-start items-start ">
				<h1 className="text-4xl font-bold text-white mb-10">
					Dashboard
				</h1>
				<div className="overflow-hidden rounded-md border border-gray-700">
					<table className="w-full text-left border-collapse">
						<thead className="bg-gray-900 border-b border-gray-700">
							<tr>
								<th className="px-4 py-2 text-gray-200">Status</th>
								<th className="px-4 py-2 text-gray-200">Device ID</th>
								<th className="px-4 py-2 text-gray-200">Firmware version</th>
								<th className="px-4 py-2 text-gray-200">CPU temperature</th>
								<th className="px-4 py-2 text-gray-200">WiFi SSID</th>
								<th className="px-4 py-2 text-gray-200">WiFi RSSI</th>
								<th className="px-4 py-2 text-gray-200">Uptime</th>
								<th className="px-4 py-2 text-gray-200">Last updated</th>
								<th className="px-4 py-2 text-gray-200">Update interval</th>
							</tr>
						</thead>
						<tbody className="bg-gray-800 divide-y divide-gray-700">
							{loading ? (
								<tr>
									<td colSpan={9} className="px-4 py-6 text-center text-gray-400">
										Loading...
									</td>
								</tr>
							) : (
								sorted_devices_by_status.map((device) => {
									const device_status = getDeviceStatus(device);
									const is_device_broadcasting = device_status == "Broadcasting";
									const is_device_idle = device_status == "Idle";
									const is_device_offline = device_status == "Offline";

									return (
										<tr key={device.device_id}>
											<td
												className={`px-4 py-2 flex items-center gap-2 ${is_device_broadcasting ? "text-green-400" : is_device_idle ? "text-orange-400" : "text-red-400"
													}`}
											>
												<span className="material-symbols-outlined">
													{is_device_broadcasting ? "sensors" : is_device_idle ? "sensors_off" : "exclamation"}
												</span>
												{device_status}
											</td>
											<td className="px-4 py-2 text-gray-500">
												{checkNull(device.device_id)}
											</td>
											<td className="px-4 py-2 text-gray-500">
												{checkNull(device.firmware_version)}
											</td>
											<td className="px-4 py-2 text-gray-500">
												{is_device_offline ? "-" : checkNull(device.cpu_temperature, "°C")}
											</td>
											<td className="px-4 py-2 text-gray-500">
												{is_device_offline ? "-" : checkNull(device.wifi_ssid)}
											</td>
											<td className="px-4 py-2 text-gray-500">
												{is_device_offline ? "-" : checkNull(device.wifi_rssi, " dBm")}
											</td>
											<td className="px-4 py-2 whitespace-nowrap text-gray-500">
												{(device.booted == null || is_device_offline) ? "-" : formatTimestamp(device.booted)}
											</td>
											<td className="px-4 py-2 whitespace-nowrap text-gray-500">
												{device.last_updated == null ? "-" : formatTimestamp(device.last_updated) + " ago"}
											</td>
											<td className="px-4 py-2 whitespace-nowrap text-gray-500">
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
