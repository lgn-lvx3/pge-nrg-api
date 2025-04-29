import type { Context, HttpRequest } from "@azure/functions";
import { CosmosRepository } from "../src/CosmosRepository";
import { index } from "./index";
import type { APIResponse } from "../src/Types";

jest.mock("../src/CosmosDao");

describe("Energy History Function", () => {
	let context: Context;
	let req: HttpRequest;
	let daoMock: jest.Mocked<CosmosRepository>;

	beforeEach(() => {
		context = {
			log: jest.fn(),
			res: {},
		} as unknown as Context;

		req = {
			method: "GET",
			params: {},
			query: {},
		} as unknown as HttpRequest;

		daoMock = new CosmosRepository() as jest.Mocked<CosmosRepository>;
	});

	it("should return 400 if no body and no date", async () => {
		req.body = null;
		await index(context, req, daoMock);

		expect(context.res.body).toEqual({
			message: "Date and usage are required.",
		} as APIResponse);
		expect(context.res.status).toEqual(400);
	});

	it("should return 400 if date not valid", async () => {
		req.body = {
			date: "not a date",
			usage: 100,
		};

		await index(context, req, daoMock);

		expect(context.res.body).toEqual({
			message: "Date is not a valid date.",
		} as APIResponse);
		expect(context.res.status).toEqual(400);
	});

	it("should return 400 if usage not a number", async () => {
		req.body = {
			date: "2024-01-01",
			usage: "not a number",
		};
		await index(context, req, daoMock);

		expect(context.res.body).toEqual({
			message: "Usage is not a valid number.",
		} as APIResponse);
		expect(context.res.status).toEqual(400);
	});

	it("should return 200 if all fields are valid", async () => {
		req.body = {
			date: "2024-01-01",
			usage: 100,
		};

		daoMock.addItem.mockResolvedValue({
			id: "123-2024-01-01",
		});

		await index(context, req, daoMock);

		expect(context.res.body).toEqual({
			message: "Energy entry added to database.",
			data: {
				id: "123-2024-01-01",
			},
		} as APIResponse);

		expect(context.res.status).toEqual(200);
	});
});
