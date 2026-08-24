(function(g){
 const PRODUCTS=[{id:'cup250',name:'Лёд в стакане 250 г',price:250,unit:'шт.',weight:'250 г'},{id:'bag1',name:'Лёд в термопакете 1 кг',price:500,unit:'шт.',weight:'1 кг'},{id:'bag2',name:'Лёд в термопакете 2 кг',price:900,unit:'шт.',weight:'2 кг'},{id:'35e74838-68cb-4fb7-9e93-7e30675c48d8',name:'Пищевой лед HoReCa 5 кг',price:1500,unit:'шт.',weight:'5 кг'}];
 const money=n=>new Intl.NumberFormat('ru-KZ',{style:'currency',currency:'KZT',maximumFractionDigits:0}).format(Number(n)||0);
 const calcOrder=o=>{const total=Array.isArray(o.items)&&o.items.length?o.items.reduce((sum,item)=>sum+(Number(item.qty)||0)*(Number(item.price)||0),0):(Number(o.qty)||0)*(Number(o.price)||0),paid=Math.max(0,Number(o.paid)||0);return{total,paid:Math.min(paid,total),debt:Math.max(0,total-paid)}};
 const calcAccrual=a=>Math.max(0,Number(a.qty)||0)*Math.max(0,Number(a.rate)||0);
 const inventory=(production,orders,products=PRODUCTS)=>products.map(p=>{const made=production.filter(x=>x.product===p.id).reduce((s,x)=>s+(Number(x.qty)||0),0);const sold=orders.filter(x=>x.product===p.id&&x.status!=='Отменён').reduce((s,x)=>s+(Number(x.qty)||0),0);return{...p,made,sold,stock:made-sold}});
 const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
 const validBackup=d=>d&&typeof d==='object'&&['orders','clients','production','employees','accruals'].every(k=>Array.isArray(d[k]));
 g.IceCore={PRODUCTS,money,calcOrder,calcAccrual,inventory,esc,validBackup};
})(typeof window==='undefined'?globalThis:window);
