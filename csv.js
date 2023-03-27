const path = require('path');
const { readdirSync, writeFileSync } = require('fs');


const base = "C:\\Users\\luke\\Downloads\\I&E playground\\";
const dirs = readdirSync(base, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
let csv = "Category|Band|Name|Entries|Place\n";

dirs.forEach(d => {
	const category = d.split(" - ")[0].trim();
	const inputs = readdirSync(path.join(base, d)).filter(f => !f.endsWith("-final.mp4") && !f.endsWith("-all.mp4") && !f.endsWith("-landscape.mp4") && !f.endsWith(".jpg"));
	inputs.forEach(i => {
		const parts = i.split(" - ");
		const name = parts[0];
		const band = parts.length > 1 ? parts[1] : name;

		csv += `${category}|${band}|${name}|1|0\n`;
	});
	csv += "||||\n"
});

writeFileSync(path.join(__dirname, "results.csv"), csv);