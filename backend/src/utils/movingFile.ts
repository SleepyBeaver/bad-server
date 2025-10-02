import { existsSync, renameSync } from 'fs'
import { basename, join } from 'path'

function movingFile(imagePath: string, from: string, to: string) {
    const fileName = basename(imagePath)
    const imagePathTemp = join(from, fileName)
    const imagePathPermanent = join(to, fileName)

    if (!existsSync(imagePathTemp)) {
        throw new Error('Ошибка при сохранении файла')
    }

    try {
        renameSync(imagePathTemp, imagePathPermanent)
    } catch {
        throw new Error('Ошибка при сохранении файла')
    }
}

export default movingFile
