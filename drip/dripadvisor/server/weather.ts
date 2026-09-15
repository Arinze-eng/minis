export type WeatherSnapshot = {
  temperatureC: number;
  apparentTemperatureC: number;
  precipitationProbability: number;
  windKmh: number;
  condition: string;
  timezone: string;
  observedAt: string;
};

function conditionForCode(code: number) {
  if (code === 0) return "Clear skies";
  if ([1, 2].includes(code)) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if ([45, 48].includes(code)) return "Foggy";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain showers";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorms";
  return "Variable conditions";
}

export async function getCurrentWeather(latitude: number, longitude: number): Promise<WeatherSnapshot> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("current", "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m");
  url.searchParams.set("hourly", "precipitation_probability");
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set("timezone", "auto");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Weather request failed (${response.status})`);
  const data = await response.json() as { current?: Record<string, number | string>; hourly?: { precipitation_probability?: number[] }; timezone?: string };
  const current = data.current ?? {};
  return {
    temperatureC: Number(current.temperature_2m ?? 0),
    apparentTemperatureC: Number(current.apparent_temperature ?? 0),
    precipitationProbability: Number(data.hourly?.precipitation_probability?.[new Date().getHours()] ?? 0),
    windKmh: Number(current.wind_speed_10m ?? 0),
    condition: conditionForCode(Number(current.weather_code ?? -1)),
    timezone: data.timezone ?? "auto",
    observedAt: String(current.time ?? new Date().toISOString()),
  };
}
