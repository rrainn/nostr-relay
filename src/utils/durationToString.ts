export function durationToString(seconds: number): string {
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor(seconds / 3600) % 24;
	const minutes = Math.floor(seconds / 60) % 60;
	seconds = seconds % 60;

	let result = "";
	if (days > 0) {
		result += `${days}d `;
	}
	if (hours > 0) {
		result += `${hours}h `;
	}
	if (minutes > 0) {
		result += `${minutes}m `;
	}
	if (seconds > 0) {
		result += `${seconds}s `;
	}
	return result.trim();
}
