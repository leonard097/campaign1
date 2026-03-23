import path from 'node:path'
import { dataDirectoryPath, readFile } from './storageService.js'

const dataFilePath = path.join(dataDirectoryPath, 'chronicle.json')

export async function readChronicle() {
  return readFile('chronicle.json')
}

export { dataFilePath }
