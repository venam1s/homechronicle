// A HAP-NodeJS occupancy sensor for the multi-address check (run.mjs starts it
// as a child process so it can kill and restart it). Toggles every 2 s.
//
// usage: node accessory.mjs <storageDir> <username> <port> <pincode>
import hap from 'hap-nodejs';

const { Accessory, Service, Characteristic, uuid, HAPStorage, Categories } = hap;
const [storage, username, port, pincode] = process.argv.slice(2);
HAPStorage.setCustomStoragePath(storage);

const accessory = new Accessory('Addr Check Sensor', uuid.generate(`hc-address-check-${username}`));
const service = accessory.addService(Service.OccupancySensor, 'Addr Check Occupancy');
let value = 0;
setInterval(() => {
  value = value ? 0 : 1;
  service.getCharacteristic(Characteristic.OccupancyDetected).updateValue(value);
}, 2000);

await accessory.publish({
  username,
  pincode,
  port: Number(port),
  category: Categories.SENSOR,
  bind: '127.0.0.1',
});
console.log(`[accessory] published ${username} on port ${port}`);
process.on('SIGTERM', async () => {
  await accessory.unpublish();
  process.exit(0);
});
