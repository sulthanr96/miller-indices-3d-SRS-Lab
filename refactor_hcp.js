const fs = require('fs');
let code = fs.readFileSync('main.js', 'utf8');

// I will overwrite rebuildCrystal entirely to handle HCP as a true hexagonal prism!
// But wait, if I rewrite rebuildCrystal, I need to make sure the Miller planes also work on it.
// Actually, I can just keep the primitive unit cell but add a toggle to show the full hexagon, OR just draw the full hexagon by default if HCP is selected!

// Let's replace the loop in rebuildCrystal with one that draws the hexagonal prism if hcp!

