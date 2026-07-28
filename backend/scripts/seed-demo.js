import { JsonStore, projectSummary } from '../lib/store.js';

const store = await new JsonStore().init();
const project = store.get().projects[0];
console.log(`Demo ready: ${project.name} (${project.id})`);
console.log(JSON.stringify(projectSummary(store.get(), project.id)));

