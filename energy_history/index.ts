// biome-ignore lint/style/useImportType: <explanation>
import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { CosmosRepository } from "../src/CosmosRepository";
import type { APIResponse, EnergyEntry } from "../src/Types";
import { Utils } from "../src/Util";

const httpTrigger: AzureFunction = async (
	context: Context,
	req: HttpRequest,
	mockDao?: CosmosRepository,
): Promise<void> => {
	context.log(`HTTP trigger for energy history - ${req.method}`);

	const user = Utils.checkAuthorization(req);

	if (!user) {
		context.log("Unauthorized");
		context.res = {
			status: 401,
			body: { message: "Unauthorized" },
		};
		return;
	}

	try {
		const dao = mockDao ?? new CosmosRepository();

		if (req.params.id) {
			// get a single entry by id
			const entry: EnergyEntry = await dao.getItem(req.params.id);
			context.res = {
				body: { data: entry } as APIResponse,
			};
		} else if (req.query.startDate && req.query.endDate) {
			// get all entries between startDate and endDate
			// order by entryDate DESC to get the most recent entries first
			const entries: EnergyEntry[] = await dao.find({
				query: `SELECT * FROM c WHERE c.type = 'energyEntry' AND c.userId = '${user.id}' AND c.entryDate >= '${req.query.startDate}' AND c.entryDate <= '${req.query.endDate}' ORDER BY c.entryDate DESC`,
			});
			context.res = {
				body: { data: entries } as APIResponse,
			};
		} else {
			// order by to get the most recent entries first
			const entries: EnergyEntry[] = await dao.find({
				query: `SELECT * FROM c WHERE c.type = 'energyEntry' AND c.userId = '${user.id}' ORDER BY c.entryDate DESC`,
			});
			// context.log(entries);
			context.res = {
				body: { data: entries } as APIResponse,
			};
		}
	} catch (error) {
		context.log(error);
		context.res = {
			status: 500,
			body: { message: "Internal server error", error: error },
		};
	}
};

/**
 * @swagger
 * /energy-history:
 *   get:
 *     summary: Retrieve energy entries
 *     description: Fetches energy entries for a user. Can retrieve a single entry by ID or all entries within a date range.
 *     tags:
 *       - Energy History
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: false
 *         description: The ID of the energy entry to retrieve.
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         required: false
 *         description: The start date for filtering energy entries.
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         required: false
 *         description: The end date for filtering energy entries.
 *     responses:
 *       200:
 *         description: A list of energy entries or a specific entry.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/APIResponse'
 *       401:
 *         description: Unauthorized access.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/APIResponse'
 */

export default httpTrigger;
