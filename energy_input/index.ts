// biome-ignore lint/style/useImportType: <explanation>
import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import type { APIResponse, EnergyEntry } from "../src/Types";
// import { Utils } from "../src/Util";
import { CosmosRepository } from "../src/CosmosRepository";
import { Utils } from "../src/Util";

const index: AzureFunction = async (
	context: Context,
	req: HttpRequest,
	mockDao?: CosmosRepository,
) => {
	context.log(`HTTP trigger for energy input - ${req.method}`);

	// // get the user auth info from the request
	const user = Utils.checkAuthorization(req);

	if (!user) {
		context.res = {
			status: 401,
			body: { message: "Unauthorized" },
		};
		return;
	}

	// get the body of the post call
	const body = req.body;

	const dao = mockDao ?? new CosmosRepository();

	// verify required fields are present
	if (!body || !body.date || !body.usage) {
		context.res = {
			status: 400,
			body: { message: "Date and usage are required." } as APIResponse,
		};
		return;
	}

	// verify date is a valid date
	if (Number.isNaN(new Date(body.date).getTime())) {
		context.res = {
			status: 400,
			body: { message: "Date is not a valid date." } as APIResponse,
		};
		return;
	}

	// verify usage is a number
	if (typeof body.usage !== "number") {
		context.res = {
			status: 400,
			body: { message: "Usage is not a valid number." } as APIResponse,
		};
		return;
	}

	// create EnergyEntry object with user id, date, usage
	const energyEntry: EnergyEntry = {
		// set date to yyyy-mm-dd
		id: `${user.id}-${new Date(body.date).toISOString().split("T")[0]}`,
		userId: user.id,
		entryDate: new Date(body.date),
		createdAt: new Date(),
		usage: body.usage,
		type: "energyEntry",
		createdType: "manual",
	};

	// add the object to the database
	const result = await dao.addItem(energyEntry);

	// return the object
	context.res = {
		status: 200,
		body: {
			message: "Energy entry added to database.",
			data: result,
		} as APIResponse,
	};
};

/**
 * @swagger
 * /energy-input:
 *   post:
 *     summary: Add a new energy entry
 *     description: This endpoint allows you to add a new energy entry to the database.
 *     tags:
 *       - Energy
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *                 example: "2023-10-01"
 *               usage:
 *                 type: number
 *                 example: 150.5
 *     responses:
 *       200:
 *         description: Energy entry added to database.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/APIResponse'
 *       400:
 *         description: Bad request. Date and usage are required or invalid.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/APIResponse'
 *       401:
 *         description: Unauthorized. User is not authorized to perform this action.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/APIResponse'
 */

export { index };
