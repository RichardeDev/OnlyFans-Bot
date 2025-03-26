const r = ({userId:e=0}) => fetch(`https://cdn2.onlyfans.com/hash/?u=${e}`).then((e=>e.ok&&e.text()));
let i=await r("95991742");

console.log(i)