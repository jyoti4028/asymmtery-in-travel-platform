const express = require('express');
const app = express();
app.use(express.json());

const Port =3012;
//  our In-Memory Database(the source of truthe)
  const irctcDatabase={
    "PNR1234567890":{
     pnr: "PNR1234567890",
     status: "waitlisted",
     chartPrepared: false,
     price: 5130,
     passenger: "jyoti swaroop singh"
    },
    "PNR987654321": {
        pnr:  "PNR987654321",
        status: "confirmed" ,
        chartPrepared: true,
        price: 1200,
        passenger: "mesria"

    }
  };
  //  2> Build the fetch api
  app.get('/api/source/ticket/:pnr',(req,res)=>{
    const pnr =req.params.pnr;
    const ticket =irctcDatabase[pnr];

      if(!ticket){
        return res.status(404).json({
            success:false,
            message: "pnr not found"
        });
      }
      // return the absolute latest state 
        return res.status(200).json({
            Printing: true,   // here the key can be n amed anything as the object is blind to the key it only prints the value part 
            hand:ticket
        });
  });
  //2.  the admin route: prepare the chart!(the action)
  //// this flips the 'chart prepared' label and cancels the tickets!
  app.post('/api/source/admin/prepare-chart', (req,res)=>{
       console.log("  ADMIN ACTION:PREPARING TRAIN CHART...");
         
         for(let key in irctcDatabase){
            let ticket=irctcDatabase[key];

            if(ticket.chartPrepared === false){
               ticket.chartPrepared=true;  // the chart is now finalised 
                
               if(ticket.status === "waitlisted"){
                  ticket.status = "Cancelled" ; //the waitlist is dead!
                  console.log(` -> Pnr: ${ticket.pnr} has been cancelled.`);
               }
            }
         }
           return res.status(200).json({
            success: true,
            message: "chart prepared! All waitlisted tickets are now CANCELED"
           })
  })
  // starting of the server 
    app.listen(Port,()=>{
        console.log( `IRCTC source simulator running on http://localhost:${Port}`);
    });
