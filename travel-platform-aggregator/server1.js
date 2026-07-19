const express = require('express');
const app = express();
app.use(express.json());

const PORT = 4000;

// 1. The Local Cache (The Vulnerable Database)
const Mydatabase = {};

// 2. The Travel Platform API Route
app.get('/api/platform/ticket/:pnr', async (req, res) => {
    const pnr = req.params.pnr;

    // We will write the logic here to fetch from Port 3012
   // check the local cache first 
  /// this is Vulnerability ! if it's cached we trust it blindly
   if(Mydatabase[pnr]){
    return res.status(200).json({
      my: true,
      source:"Aggregator Cached(warning: might be stale data)",
      data: Mydatabase[pnr]
    });
   } 
   try{
    //Fetch fresh data from the source server(port 3012)
    const response= await fetch(`http://localhost:3012/api/source/ticket/${pnr}`);
    //const irctcResult = await response.json();
     if(!response.ok){
        return res.status(404).json({
            error: "Ticket not found in the source server"
        });
     }   
     const Result= await response.json();
     // store the fresh data in the local cache
       Mydatabase[pnr] = Result.hand;

        return res.status(200).json({
             cache:false,
             source:"fresh from Irctc source",
             data: Result
        });
}
   catch(error){
       console.error(" error fetching ",error);
       return res.status(500).json({
        error: "Aggregator failed to connect to Irctc"
       });
   }
});
////3. the vulnerable Action route (buying the trip Gurantee)
app.post('/api/platform/buy-trip-gurantee',(req,res)=>{
      const pnr = req.body.pnr;
      /// we grab the data from the local cache 
          const ticketdata= Mydatabase[pnr];
           if(!ticketdata){
            return res.status(400).json({
                 error: "please fetch your ticket details first "
            });
           }
           /// the Fatal flaw: we trust the ticket data to process payment
          if(ticketdata.status === 'waitlisted' && ticketdata.chartPrepared === false){
            // the server happily sells the insurance
              return res.status(200).json({
                success: true,
                message: "trip gurantee bought success",
                exposure: "rs5130",
                data: ticketdata
              });
          } 
       else{
   return res.status(400).json({
      happened:false,
      message:"Transaction blocked: chart is already prepared or ticket is confirmed "
   });
       }   
    });
    
app.listen(PORT, () => {
    console.log(`✈️ Travel Platform Aggregator running on http://localhost:${PORT}`);
});
