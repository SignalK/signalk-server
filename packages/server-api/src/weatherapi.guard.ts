/*
 * Generated type guards for "weatherapi.ts".
 * WARNING: Do not manually change this file.
 */
import { WeatherProvider } from "./weatherapi";

export function isWeatherProvider(obj: unknown): obj is WeatherProvider {
    const typedObj = obj as WeatherProvider
    return (
        (typedObj !== null &&
            typeof typedObj === "object" ||
            typeof typedObj === "function") &&
        typeof typedObj["name"] === "string" &&
        (typedObj["methods"] !== null &&
            typeof typedObj["methods"] === "object" ||
            typeof typedObj["methods"] === "function") &&
        (typeof typedObj["methods"]["pluginId"] === "undefined" ||
            typeof typedObj["methods"]["pluginId"] === "string") &&
        typeof typedObj["methods"]["getObservations"] === "function" &&
        typeof typedObj["methods"]["getForecasts"] === "function" &&
        typeof typedObj["methods"]["getWarnings"] === "function"
    )
}
