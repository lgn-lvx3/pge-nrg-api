/* eslint-disable no-undef */
// @logan - basic swagger def to be used by swagger-jsdoc
module.exports = {
	openapi: "3.0.0",
	failOnErrors: true,
	info: {
		title: "pge-nrg-api",
		version: "1.0.0",
		description: "OpenAPI 3.0.0 documentation for the pge-nrg-api",
		contact: {
			name: "pge-nrg",
			url: "https://logan@lvx3.com",
		},
	},
	servers: [
		{
			url: "https://https://lively-mud-02baee110.4.azurestaticapps.net/",
			description: "Development server",
		},
	],
};
