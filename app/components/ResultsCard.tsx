'use client';
import React from 'react';

export function fmtW(w:number){ return `${Math.round(w).toLocaleString()} W`; }
export function fmtBTUh(w:number){ return `${Math.round(w*3.412142).toLocaleString()} BTU/h`; }

export default function ResultsCard(
  { title='Results', rows }:{ title?:string; rows: Array<[string,string]>; }
){
  return (
    <aside style={card}>
      <h3 style={{margin:'0 0 6px'}}>{title}</h3>
      <div style={{fontSize:13,color:'#555',marginBottom:8}}>Transmission + Ventilation</div>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:14}}>
        <tbody>
          {rows.map(([k,v]) => (
            <tr key={k}>
              <td style={{padding:'6px 0',color:'#444'}}>{k}</td>
              <td style={{padding:'6px 0',textAlign:'right',fontWeight:600}}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </aside>
  );
}

const card: React.CSSProperties = {
  border:'1px solid #E5E7EB', borderRadius:8, padding:12, background:'#fff',
  position:'sticky', top:12, minWidth:260
};
