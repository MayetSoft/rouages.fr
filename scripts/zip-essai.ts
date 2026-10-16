/**
 * Une archive zip fabriquée pour les contrôles (`verifier-geo`, `verifier-horaires`).
 */
import { crc32 } from 'node:zlib';

/** Une archive zip sans compression : de quoi faire lire `unzip -p` sans dépendre de `zip`. */
export function zip(fichiers: [string, Buffer][]): Buffer {
  const locaux: Buffer[] = [];
  const centraux: Buffer[] = [];
  let decalage = 0;
  for (const [nom, donnees] of fichiers) {
    const n = Buffer.from(nom);
    const crc = crc32(donnees);
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0);
    l.writeUInt16LE(20, 4);
    l.writeUInt32LE(crc, 14);
    l.writeUInt32LE(donnees.length, 18);
    l.writeUInt32LE(donnees.length, 22);
    l.writeUInt16LE(n.length, 26);
    locaux.push(l, n, donnees);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(donnees.length, 20);
    c.writeUInt32LE(donnees.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(decalage, 42);
    centraux.push(c, n);
    decalage += 30 + n.length + donnees.length;
  }
  const central = Buffer.concat(centraux);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(fichiers.length, 8);
  fin.writeUInt16LE(fichiers.length, 10);
  fin.writeUInt32LE(central.length, 12);
  fin.writeUInt32LE(decalage, 16);
  return Buffer.concat([...locaux, central, fin]);
}
