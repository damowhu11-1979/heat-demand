export function fmtW(n){ return Number(n).toFixed(0) + ' W'; }
export function fmtKW(n){ return (Number(n)/1000).toFixed(2) + ' kW'; }
export function fmtWm2(n){ return Number(n).toFixed(1) + ' W/m²'; }
export function fmtC(n){ return Number(n).toFixed(1) + ' °C'; }
export function sum(arr){ return arr.reduce((a,b)=>a+b,0); }
export function readData(){
  const qp = new URLSearchParams(location.search);
  const qs = qp.get('data');
  if(qs){ try{ return JSON.parse(decodeURIComponent(qs)); }catch(e){} }
  const ss = sessionStorage.getItem('heatCalc');
  return ss ? JSON.parse(ss) : null;
}
