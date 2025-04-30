// biome-ignore lint/style/useImportType: <explanation>
import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { Utils } from "../src/Util";
import {
	ALERT_CHANNEL,
	type APIResponse,
	REQUEST_METHOD,
	type Alert,
} from "../src/Types";
import { CosmosRepository } from "../src/CosmosRepository";

const httpTrigger: AzureFunction = async (
	context: Context,
	req: HttpRequest,
): Promise<void> => {
	context.log(`HTTP trigger for energy alerts - ${req.method}`);

	const user = Utils.checkAuthorization(req);

	if (!user) {
		context.res = {
			status: 401,
			body: { message: "Unauthorized" },
		};
		return;
	}

	switch (req.method) {
		case REQUEST_METHOD.GET: {
			if (!req.params.id) {
				// get all alerts for a user
				const dao = new CosmosRepository();
				const alerts = await dao.find({
					query: `SELECT * FROM c WHERE c.userId = '${user.id}' AND c.type = 'alert'`,
				});

				context.res = {
					body: { data: alerts } as APIResponse,
				};
			} else {
				// get a single alert by id
				const dao = new CosmosRepository();
				const alert: Alert = await dao.getItem(req.params.id);

				context.res = {
					body: { data: alert } as APIResponse,
				};
			}

			break;
		}
		case REQUEST_METHOD.POST: {
			const body = req.body;
			// console.log(body);
			if (!body || !body.threshold || typeof body.threshold !== "number") {
				context.res = {
					status: 400,
					body: { message: "Threshold is required." } as APIResponse,
				};
				return;
			}

			// verify threshold is a number
			const verifiedThreshold = Number(body.threshold);
			if (Number.isNaN(verifiedThreshold)) {
				context.res = {
					status: 400,
					body: { message: "Threshold must be a number." } as APIResponse,
				};
				return;
			}

			const alert: Alert = {
				id: Utils.basicId(),
				userId: user.id,
				// we add email for timer email alert function
				userEmail: user.email,
				createdAt: new Date(),
				updatedAt: new Date(),
				threshold: body.threshold,
				channels: body.channels || [ALERT_CHANNEL.EMAIL], // default to email
				type: "alert",
			};

			const dao = new CosmosRepository();

			// addItem here is an upsert
			const result = await dao.addItem(alert);

			context.res = {
				body: {
					data: result,
					message: "Alert added to database.",
				} as APIResponse,
			};
			break;
		}
		case REQUEST_METHOD.DELETE: {
			if (!req.params.id) {
				context.res = {
					status: 400,
					body: { message: "Alert ID is required." } as APIResponse,
				};
				return;
			}
			const dao = new CosmosRepository();
			const alertId = req.params.id;
			await dao.deleteItem(alertId);

			context.res = {
				body: { message: "Successfully deleted alert." } as APIResponse,
			};
			break;
		}
		default: {
			context.res = {
				status: 405,
				body: { message: "Method not allowed." } as APIResponse,
			};
		}
	}
};

/**
 * @swagger
 * /energy-alerts:
 *   get:
 *     summary: Retrieve all alerts for a user or a specific alert by ID
 *     description: Fetches all alerts associated with a user or a specific alert if an ID is provided.
 *     tags:
 *       - Alerts
 *     parameters:
 *       - in: query
 *         name: id
 *         schema:
 *           type: string
 *         required: false
 *         description: The ID of the alert to retrieve.
 *     responses:
 *       200:
 *         description: A list of alerts or a specific alert.
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
 *   post:
 *     summary: Create a new alert
 *     description: Adds a new alert to the database for the authenticated user.
 *     tags:
 *       - Alerts
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               threshold:
 *                 type: number
 *                 description: The threshold value for the alert.
 *               channels:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/ALERT_CHANNEL'
 *                 description: The channels through which the alert will be sent.
 *     responses:
 *       200:
 *         description: Alert added to database.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/APIResponse'
 *       400:
 *         description: Bad request. Threshold is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/APIResponse'
 *   delete:
 *     summary: Delete an alert
 *     description: Deletes an alert from the database by its ID.
 *     tags:
 *       - Alerts
 *     parameters:
 *       - in: query
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the alert to delete.
 *     responses:
 *       200:
 *         description: Successfully deleted alert.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/APIResponse'
 *       400:
 *         description: Bad request. Alert ID is required.
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
 *       405:
 *         description: Method not allowed.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/APIResponse'
 */

export default httpTrigger;
