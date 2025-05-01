import type { AzureFunction, Context, HttpRequest } from "@azure/functions";
import type { APIResponse, EnergyEntry } from "../src/Types";
import { CosmosRepository } from "../src/CosmosRepository";
import { AzureOpenAI } from "openai";

interface RecommendationResponse {
	summary: string;
	recommendations: string[];
	estimatedSavings: string;
}

const httpTrigger: AzureFunction = async (
	context: Context,
	req: HttpRequest,
): Promise<void> => {
	try {
		const userId = req.params.userId;
		if (!userId) {
			context.res = {
				status: 400,
				body: {
					message: "User ID is required",
				} as APIResponse,
			};
			return;
		}

		// Get user's energy entries
		const dao = new CosmosRepository();
		const querySpec = {
			query:
				"SELECT * FROM c WHERE c.userId = @userId AND c.type = 'energyEntry' ORDER BY c.entryDate DESC",
			parameters: [
				{
					name: "@userId",
					value: userId,
				},
			],
		};

		const entries = await dao.find<EnergyEntry>(querySpec);

		if (!entries || entries.length === 0) {
			context.res = {
				status: 404,
				body: {
					message: "No energy entries found for this user",
				} as APIResponse,
			};
			return;
		}

		// Take a sample of entries if there are too many (last 3000 days)
		const sampleEntries = entries.slice(0, 1000);

		context.log("sampleEntries", sampleEntries.length);

		// Format entries for the prompt
		const formattedEntries = sampleEntries.map((entry) => {
			// Log the type of entryDate for debugging
			context.log("entryDate type:", typeof entry.entryDate);
			context.log("entryDate value:", entry.entryDate);

			return {
				// format date to YYYY-MM-DD
				date: entry.entryDate.toString().split("T")[0],
				usage: entry.usage,
			};
		});

		// Initialize Azure OpenAI client
		const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
		const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
		const apiKey = process.env.AZURE_OPENAI_API_KEY;
		const apiVersion = "2025-01-01-preview";

		if (!endpoint || !deployment) {
			throw new Error("Azure OpenAI configuration is missing");
		}

		const client = new AzureOpenAI({
			endpoint,
			apiKey,
			apiVersion,
			deployment,
		});

		// Create the prompt
		const prompt = `You are an energy efficiency expert. Analyze the following energy consumption data and provide specific recommendations for reducing energy usage. 
        Focus on practical, actionable advice that can be implemented easily. Include estimated savings where possible. Be concise without losing important information. List a few of the most important recommendations.

        Energy Consumption Data:
        ${JSON.stringify(formattedEntries, null, 2)}

        Please provide your response in the following JSON format:
        {
            "summary": "A brief summary of the consumption patterns",
            "recommendations": ["List of specific recommendations"],
            "estimatedSavings": "Estimated savings in kWh or percentage"
        }`;

		// Get recommendations from Azure OpenAI
		const result = await client.chat.completions.create({
			model: deployment,
			messages: [
				{
					role: "system",
					content:
						"You are an energy efficiency expert providing specific, actionable recommendations.",
				},
				{ role: "user", content: prompt },
			],
		});

		context.log("result", result);

		// Parse the response
		const responseContent = result.choices[0]?.message?.content;
		if (!responseContent) {
			throw new Error("No response from Azure OpenAI");
		}

		const recommendations: RecommendationResponse = JSON.parse(responseContent);
		context.log("recommendations", recommendations);

		// Set the response
		context.res = {
			status: 200,
			body: {
				message: "Recommendations generated successfully",
				data: {
					...recommendations,
					entries: sampleEntries.length,
				},
			},
		};
	} catch (error) {
		context.log.error("Error generating recommendations:", error);
		context.res = {
			status: 500,
			body: {
				message: `Error generating recommendations: ${error.message}`,
			} as APIResponse,
		};
	}
};

export default httpTrigger;

/**
 * @swagger
 * /api/recommendations/{userId}:
 *   get:
 *     summary: Get personalized energy efficiency recommendations
 *     description: Analyzes a user's energy consumption patterns using Azure OpenAI to provide personalized recommendations for reducing energy usage.
 *     tags:
 *       - Recommendations
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user to generate recommendations for
 *     responses:
 *       200:
 *         description: Recommendations generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Recommendations generated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     summary:
 *                       type: string
 *                       description: A brief summary of the consumption patterns
 *                     recommendations:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: List of specific recommendations
 *                     estimatedSavings:
 *                       type: string
 *                       description: Estimated savings in kWh or percentage
 *                     entries:
 *                       type: number
 *                       description: Number of entries analyzed
 *       400:
 *         description: Bad request. User ID is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/APIResponse'
 *       404:
 *         description: No energy entries found for this user.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/APIResponse'
 *       500:
 *         description: Error generating recommendations.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/APIResponse'
 */
