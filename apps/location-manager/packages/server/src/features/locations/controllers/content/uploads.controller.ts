import type { Context } from "hono";
import { getUploadsControllerDeps } from "../dependencies";
import {
  handleAddImageSetUpload,
  handleLegacyUpload,
  handleReplaceUploadVariants,
} from "./uploads/image-set-upload.handlers";
import { handleGenerateAltText } from "./uploads/upload-alt-text.handler";
import {
  handleDeleteUpload,
  handleReprocessUploadVariants,
  handleUpdateUploadPhotographerCredit,
} from "./uploads/upload-lifecycle.handlers";

const { uploads } = getUploadsControllerDeps();

export async function postAddUpload(c: Context) {
  return handleLegacyUpload(c);
}

export async function postAddUploadImageSet(c: Context) {
  return handleAddImageSetUpload(c, uploads);
}

export async function postReplaceUploadVariants(c: Context) {
  return handleReplaceUploadVariants(c, uploads);
}

export async function deleteUpload(c: Context) {
  return handleDeleteUpload(c, uploads);
}

export async function patchUploadPhotographerCredit(c: Context) {
  return handleUpdateUploadPhotographerCredit(c, uploads);
}

export async function postReprocessUploadVariants(c: Context) {
  return handleReprocessUploadVariants(c, uploads);
}

export async function postGenerateAltText(c: Context) {
  return handleGenerateAltText(c, uploads);
}
