const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const startTime = new Date(2022, 11, 26, 16);

async function main() {

	const data = JSON.parse(fs.readFileSync(path.join(__dirname, "tmp", "running-order.json")));
	data.pop();
	data.shift();

	const groups = {};

	data.forEach(item => {
		let name = item.name;
		const time = new Date(startTime);
		time.setSeconds(time.getSeconds() + item.startTime);

		if (name.indexOf(":\\") > -1) {
			const parsed = path.parse(item.name);
			name = parsed.dir.split("\\").pop();
		}

		console.log(`${name} - ${time}`);

		let groupIdentifier = "";
		if (name == 'Break' || name == 'Outro') {
			groupIdentifier = name;
			return;
		} else if (name.indexOf("Ensemble") > -1 || name.substring(0, 1) == 'O') {
			groupIdentifier = "Ensemble";
		} else {
			const parts = name.split("-")[1].trim().split(" ");

			for (let i = 0; i < parts.length; i++) {
				if (parts[i] == 'Over' || (!isNaN(parts[i]) && !isNaN(parseFloat(parts[i])))) {
					break;
				}

				groupIdentifier += " " + parts[i];
			}
		}

		groupIdentifier = groupIdentifier.trim();

		const payload = {
			name,
			time
		};

		if (groups.hasOwnProperty(groupIdentifier)) {
			groups[groupIdentifier].push(payload);
		} else {
			groups[groupIdentifier] = [payload]
		}
	});

	const opts = {
		width: 1080,
		height: 1080
	};

	const imgBase = path.join(__dirname, "tmp", "gfx");
	if (!fs.existsSync(imgBase)) {
		fs.mkdirSync(imgBase, { recursive: true });
	}

	const textTemplate = `
	<svg width="${opts.width}" height="${opts.height}">
		<style>
			.title { 
				fill: #282360; 
				font-size: 65px; 
				font-weight: bold; 
				font-family: 'Asket'; 
				text-transform: uppercase;
			}

			.category{
				fill: #282360;
				font-family: 'Open Sans';
			}
		</style>
		<text x="50%" y="20%" text-anchor="middle" class="title">{{title}}</text>
		{{categories}}
	</svg>
`;

	const names = Object.keys(groups);
	console.log(names.length);

	for (let index = 0; index < names.length; index++) {
		const k = names[index].replaceAll("&", "&amp;");

		const groupData = groups[k];
		const dest = path.join(imgBase, `${index + 1} - ${k}.png`);

		let categories = "";
		const spacing = 10;
		let top = 35;

		groupData.forEach(category => {
			const start = category.time.toTimeString().substring(0, 5);
			const fontSize = 40;//Math.min(40, opts.width / category.name.length) + 2;
			let name = category.name.replaceAll("&", "&amp;").replaceAll(k, "");

			if(name.indexOf(" - ") > -1){
				name = name.split(" - ")[1].trim();
			}

			categories += `<text x="35%" y="${top}%" class="category" font-size="${fontSize}px"><tspan style="font-weight: bold">${start}:</tspan> ${name}</text>\n`;
			top += spacing;
		});

		const text = textTemplate.replaceAll("{{title}}", k.toUpperCase()).replaceAll("{{categories}}", categories.trim()).trim();

		const [byba, tymba, sponsor, buffer] = await Promise.all([
			sharp('byba.png').flatten({ background: '#FFF' }).resize({ height: opts.height * 0.4 }).ensureAlpha(0.4).toBuffer(),
			sharp('TYMBA.png').flatten({ background: '#FFF' }).resize({ height: opts.height * 0.4 }).ensureAlpha(0.4).toBuffer(),
			sharp('marching arts.png').flatten({ background: '#FFF' }).resize({ height: opts.height * 0.1 }).toBuffer(),
			sharp(Buffer.from(text)).toBuffer()
		]);

		await sharp({
			create: {
				width: opts.width,
				height: opts.height,
				channels: 4,
				background: {
					r: 255,
					g: 255,
					b: 255,
					alpha: 1
				}
			}
		}).composite([
			{
				input: byba,
				top: opts.height * 0.3,
				left: -250
			},
			{
				input: tymba,
				top: opts.height * 0.3,
				left: opts.width - 200
			},
			{
				input: sponsor,
				left: opts.width * 0.35,
				top: opts.height * 0.85
			},
			{
				input: buffer,
				left: 0,
				top: 0
			}
		]).toFile(dest);
	}
}

main().catch(e => {
	console.log("Error");
	console.log(e);	
});