export enum ALERT_CHANNEL {
	EMAIL = "email",
	SMS = "sms",
}

export enum REQUEST_METHOD {
	GET = "GET",
	POST = "POST",
	PUT = "PUT",
	DELETE = "DELETE",
}

export type Alert = {
	id: string;
	userId: string;
	userEmail?: string;
	createdAt: Date;
	updatedAt: Date;
	threshold: number;
	channels: ALERT_CHANNEL[];
	type: "alert";
};

export type User = {
	id: string;
	username?: string;
	userRoles?: string[];
	identityProvider?: string;
	email?: string;
	createdAt: Date;
	updatedAt: Date;
	type: "user";
};

export type EnergyEntry = {
	id: string;
	userId: string;
	entryDate: Date;
	usage: number;
	createdAt: Date;
	createdType: "manual" | "upload";
	type: "energyEntry";
};

export type APIResponse = {
	message?: string;
	data?: unknown;
};

/**
 * @swagger
 * components:
 *   schemas:
 *     Alert:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         userId:
 *           type: string
 *         userEmail:
 *           type: string
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         threshold:
 *           type: number
 *         channels:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ALERT_CHANNEL'
 *         type:
 *           type: string
 *           enum: [alert]
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         username:
 *           type: string
 *           nullable: true
 *         userRoles:
 *           type: array
 *           items:
 *             type: string
 *           nullable: true
 *         identityProvider:
 *           type: string
 *           nullable: true
 *         email:
 *           type: string
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         type:
 *           type: string
 *           enum: [user]
 *     EnergyEntry:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         userId:
 *           type: string
 *         entryDate:
 *           type: string
 *           format: date
 *         usage:
 *           type: number
 *         createdAt:
 *           type: string
 *           format: date-time
 *         createdType:
 *           type: string
 *           enum: [manual, upload]
 *         type:
 *           type: string
 *           enum: [energyEntry]
 *     APIResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           nullable: true
 *         data:
 *           type: object
 *           nullable: true
 *     ALERT_CHANNEL:
 *       type: string
 *       enum: [email, sms]
 *     REQUEST_METHOD:
 *       type: string
 *       enum: [GET, POST, PUT, DELETE]
 */
