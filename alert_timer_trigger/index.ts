import type { AzureFunction, Context } from "@azure/functions";
import { CosmosRepository } from "../src/CosmosRepository";
import type { Alert, EnergyEntry } from "../src/Types";
import axios from "axios";

const sendGridApiKey = process.env.sendgrid_api_key;

const buildAndSendMessage = async (alert: Alert, entry: EnergyEntry) => {
	const sendGridMessage = {
		personalizations: [{ to: [{ email: alert.userEmail }] }],
		from: { email: "logan@lvx3.com" },
		subject: "Your energy usage is over your threshold.",
		content: [
			{
				type: "text/plain",
				value: `Your entry on ${entry.entryDate} was ${
					entry.usage
				}kWh, which is over your threshold of ${alert.threshold}kWh by ${
					entry.usage - alert.threshold
				}kWh.`,
			},
		],
	};

	await axios.post("https://api.sendgrid.com/v3/mail/send", sendGridMessage, {
		headers: {
			Authorization: `Bearer ${sendGridApiKey}`,
			"Content-Type": "application/json",
		},
	});

	return sendGridMessage;
};

const timerTrigger: AzureFunction = async (context: Context): Promise<void> => {
	context.log(
		"Timer alert trigger function executed at",
		new Date().toISOString(),
	);

	// Fetch the latest energy usage data, in the last hour
	const dao = new CosmosRepository();

	// get time since last run, so 1 hr
	const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

	// Fetch the latest data since last run
	const energyEntries: EnergyEntry[] = await dao.find({
		query: `SELECT * FROM c WHERE c.type = 'energyEntry' AND c.entryDate > '${oneHourAgo}' ORDER BY c.entryDate DESC`,
	});

	// Fetch alert thresholds
	const alerts: Alert[] = await dao.find({
		query: "SELECT * FROM c WHERE c.type = 'alert'",
	});

	// loop through entries in last hour, fetch user alert for that entry
	for (const entry of energyEntries) {
		const alert = alerts.find((alert) => alert.userId === entry.userId);

		// if usage is over threshold, send notification
		if (alert && entry.usage > alert.threshold) {
			// send notification
			context.log(
				`Alert threshold exceeded for user ${alert.userId}. Sending email...`,
			);
			await buildAndSendMessage(alert, entry);
		}
	}
};

export default timerTrigger;
