const a = require('./node_modules/firebase-admin');
a.initializeApp({
  credential: a.credential.cert({
    projectId: 'subh-dashboard',
    clientEmail: 'firebase-adminsdk-fbsvc@subh-dashboard.iam.gserviceaccount.com',
    privateKey: process.env.FK
  })
});
const db = a.firestore();
db.collection('students').limit(5).get().then(s => {
  console.log('Total docs:', s.size);
  s.forEach(d => {
    const v = d.data();
    console.log(JSON.stringify({ name: v.name, status: v.status, is_deleted: v.is_deleted, class: v.class, batch: v.batch }));
  });
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
