const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, '../node_modules/three/examples/jsm/controls/PointerLockControls.js')
if (!fs.existsSync(file)) process.exit(0)

let text = fs.readFileSync(file, 'utf8')
if (!text.includes('this.lookScale')) {
  text = text.replace(
    'this.maxPolarAngle = Math.PI; // radians\n',
    'this.maxPolarAngle = Math.PI; // radians\n\t\tthis.lookScale = 1;\n'
  )
}
text = text.replace(
  '_euler.y -= movementX * 0.002;\n\t\t\t_euler.x -= movementY * 0.002;',
  '_euler.y -= movementX * 0.002 * scope.lookScale;\n\t\t\t_euler.x -= movementY * 0.002 * scope.lookScale;'
)
fs.writeFileSync(file, text)
