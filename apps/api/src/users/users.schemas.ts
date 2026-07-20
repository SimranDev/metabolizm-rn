// Account preference schemas live in @metabolizm/shared (the mobile client
// posts the device timezone on launch); re-exported here so controller and
// service imports stay local.
export { updateMeSchema, type UpdateMeInput } from "@metabolizm/shared";
