import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.hourly("morning outfit", { minuteUTC: 0 }, internal.daily.morning, {});
crons.interval("sweep stuck jobs and expired states", { minutes: 15 }, internal.daily.sweep, {});
export default crons;
