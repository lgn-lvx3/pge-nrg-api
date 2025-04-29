import type { AzureFunction, Context } from "@azure/functions";
import type { EventGridEvent } from "@azure/eventgrid";

const eventGridTrigger: AzureFunction = async (
	context: Context,
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	eventGridEvent: EventGridEvent<any>,
): Promise<void> => {
	context.log(
		"Event Grid trigger function processed an event:",
		eventGridEvent,
	);
};

export default eventGridTrigger;
