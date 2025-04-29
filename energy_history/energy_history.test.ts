import type { Context, HttpRequest } from "@azure/functions";
import { CosmosRepository } from "../src/CosmosRepository";
import httpTrigger from "./index";
import type { APIResponse, EnergyEntry } from "../src/Types";

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

	it("should return all energy entries for a user", async () => {
		const mockEntries: EnergyEntry[] = [
			{
				id: "1",
				userId: "123",
				entryDate: new Date(),
				usage: 100,
				createdAt: new Date(),
				createdType: "manual",
				type: "energyEntry",
			},
		];

		daoMock.find.mockResolvedValue(mockEntries);

		await httpTrigger(context, req, daoMock);

		expect(context.res.body).toEqual({ data: mockEntries } as APIResponse);
		expect(daoMock.find).toHaveBeenCalledTimes(1);
	});

	it("should return a single energy entry for a user", async () => {
		const mockEntry: EnergyEntry = {
			id: "1",
			userId: "123",
			entryDate: new Date(),
			usage: 100,
			createdAt: new Date(),
			createdType: "manual",
			type: "energyEntry",
		};

		req.params.id = "1";

		daoMock.getItem.mockResolvedValue(mockEntry);

		await httpTrigger(context, req, daoMock);

		expect(context.res.body).toEqual({ data: mockEntry } as APIResponse);
		expect(daoMock.getItem).toHaveBeenCalledTimes(1);
	});

	it("should return all energy entries for a user between startDate and endDate", async () => {
		const mockEntries: EnergyEntry[] = [
			{
				id: "1",
				userId: "123",
				entryDate: new Date(),
				usage: 100,
				createdAt: new Date(),
				createdType: "manual",
				type: "energyEntry",
			},
		];

		req.query.startDate = "2024-01-01";
		req.query.endDate = "2024-01-02";

		daoMock.find.mockResolvedValue(mockEntries);

		await httpTrigger(context, req, daoMock);

		expect(context.res.body).toEqual({ data: mockEntries } as APIResponse);
		expect(daoMock.find).toHaveBeenCalledTimes(1);
	});
});
