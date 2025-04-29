import type { AzureFunction, Context, HttpRequest } from "@azure/functions";
// import { Utils } from "../src/Util";
import {
	BlobSASPermissions,
	StorageSharedKeyCredential,
	generateBlobSASQueryParameters,
} from "@azure/storage-blob";
import type { APIResponse } from "../src/Types";

const httpTrigger: AzureFunction = async (
	context: Context,
	req: HttpRequest,
): Promise<void> => {
	// const user = Utils.checkAuthorization(req);

	// if (!user) {
	// 	context.res = {
	// 		status: 401,
	// 		body: { message: "Unauthorized" },
	// 	};
	// 	return;
	// }

	if (!req.body.filename) {
		context.res = {
			status: 400,
			body: { message: "Filename is required" },
		};
		return;
	}

	const blobName = `${req.body.filename}`;

	console.log("blobName", blobName);
	// const blobName = `${req.body.filename}-${user.id}`;

	// Enter your storage account name and shared key
	const accountName = process.env.blob_storage_account_name || "";
	const accountKey = process.env.blob_storage_account_key || "";
	const containerName = process.env.blob_storage_container_name || "";

	// Use StorageSharedKeyCredential with storage account and account key
	// StorageSharedKeyCredential is only available in Node.js runtime, not in browsers
	const credential = new StorageSharedKeyCredential(accountName, accountKey);

	// set the expiry to 1 hour from now
	const expiry = new Date();
	expiry.setHours(expiry.getHours() + 1);

	// generate the sas token
	const sasToken = generateBlobSASQueryParameters(
		{
			containerName,
			permissions: BlobSASPermissions.parse("cw"), // create, write
			expiresOn: expiry,
		},
		credential,
	).toString();

	// return the object
	context.res = {
		status: 200,
		body: {
			message: "Upload token generated.",
			data: `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}?${sasToken}`,
		} as APIResponse,
	};
};
export default httpTrigger;
