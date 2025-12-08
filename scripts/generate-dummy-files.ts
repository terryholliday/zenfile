import fs from 'fs/promises'
import path from 'path'

// Improved generator to create folders and more files
const TARGET_DIR = process.argv[2] || './dummy-files'
const COUNT = parseInt(process.argv[3] || '1000') // Default to 1000 now

async function generate() {
  await fs.mkdir(TARGET_DIR, { recursive: true })
  console.log(`Generating ${COUNT} files in ${TARGET_DIR}...`)

  for (let i = 0; i < COUNT; i++) {
    const folderIndex = Math.floor(i / 100)
    const folderPath = path.join(TARGET_DIR, `folder_${folderIndex}`)

    if (i % 100 === 0) {
      await fs.mkdir(folderPath, { recursive: true })
    }

    const filename = `file_${i}.txt`
    const content = `This is dummy file number ${i}\nRandom Data: ${Math.random()}`
    const filePath = path.join(folderPath, filename)

    await fs.writeFile(filePath, content)

    // Create duplicate every 10th file
    if (i % 10 === 0) {
      const dupPath = path.join(folderPath, `copy_${filename}`)
      await fs.writeFile(dupPath, content)
    }

    // Large file every 500th
    if (i > 0 && i % 500 === 0) {
      const largePath = path.join(folderPath, `large_${i}.bin`)
      const buffer = Buffer.alloc(1024 * 1024 * 10) // 10MB
      await fs.writeFile(largePath, buffer)
    }
  }

  console.log('Done.')
}

generate().catch(console.error)
