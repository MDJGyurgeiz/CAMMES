 


// lettura  micrometro  rev 7

String w[10];
char misura[10];

String measure="";
#include <SPI.h>
int i=0;
double number=0;
double numbf=0;
int k[26];

long int time=0;

byte a;

void setup() {
Serial.begin(9600);
attachInterrupt(digitalPinToInterrupt(2), imp,FALLING);
SPI.begin ();
pinMode(10,OUTPUT);
digitalWrite(10, HIGH); 
SPI.setClockDivider(SPI_CLOCK_DIV8);
  
}

void loop() {
}


//------------------------------------------------------------------------------------------- loop end ----------------------------------------

void imp(){


 i=i+1;
 if(i<=24){
 k[i]=digitalRead(5);

 }
 if(i>=17){
   

  
 for(i=2;i<=17;i++){

 number=number+k[i]*pow(2,i-2);


 }
  
 numbf=number/2000;
 
 
 measure +=numbf;
 if(numbf<10){
 measure="0"+measure;
   }


measure.toCharArray(misura, 6);

 

  
digitalWrite(10, LOW);  
SPI.transfer ('#'); 

 
 for( int t=0; t<=5;t++){
 
  
   SPI.transfer (misura[t]); 

   }
 
   
   measure="";
digitalWrite(10, HIGH);
 
   number=0;
   numbf=0;
   i=0;
 

 }
 
   
 }
 
 

 
 
 


