import QRCode from 'qrcode';
async function test() {
    const qr = '2@QZtnljcDIJ0+jSE0FlmEkU90/+Bv9ANTolxHIahhipiUDa+lVNhXSHmYwBmpaxBj4iAcGJkkp6QbWH66vKQkMAdlAtPFP8in5DI=,GWcw+RTW8GWiHfhLpkpG33Y8+X8kJ1zKnhnW7dRi5hs=,pT7XRAy4yY+smV6VvCpUkVV6PM3FZKD0oKliERKZFxQ=,1mk6NatGSc14IGrsH2SXx6z5LtL1+9YRrmI0FTjTrZI=';
    const url = await QRCode.toDataURL(qr);
    console.log(url.substring(0, 50));
}
test();