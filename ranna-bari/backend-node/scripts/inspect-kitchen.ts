/** Inspect one kitchen and its documents — what an admin page has to show. */
import { connect, disconnect } from '../src/config/db.js';
import { Kitchen, Account, KitchenDocument } from '../src/models/index.js';

const id = process.argv[2] ?? '6aa4a670f7fefb8a6e546837';

await connect();

const kitchen = await Kitchen.findById(id).lean();
if (!kitchen) {
  console.log('kitchen not found:', id);
} else {
  console.log('kitchen:', kitchen.name, '· accountId:', kitchen.accountId);
  console.log('coverImage:', JSON.stringify(kitchen.coverImage)?.slice(0, 120));
  console.log('photos:', JSON.stringify(kitchen.photos ?? [])?.slice(0, 500));
  console.log('documentsSubmittedAt:', kitchen.documentsSubmittedAt);
  console.log('kycStatus:', kitchen.kycStatus);
}

const account = kitchen ? await Account.findById(kitchen.accountId).lean() : null;
if (account) {
  console.log('\naccount:', account.name, account.email, account.phone);
  console.log('nid:', account.nid);
}

const docs = await KitchenDocument.find({
  $or: [{ kitchenId: id }, ...(kitchen ? [{ kitchenId: String(kitchen._id) }] : [])],
})
  .select('kind filename mimeType size uploadedAt data')
  .lean();

console.log('\ndocuments:', docs.length);
for (const d of docs) {
  console.log(
    `  ${d.kind} · ${d.filename} · ${d.mimeType} · ${d.size} bytes · has data: ${!!d.data} · len: ${d.data?.length ?? 0}`,
  );
}

await disconnect();
