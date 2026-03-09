
int stepDirection = -1;
long int microtime;
int val=0;
int PUL=7; 
int DIR=6; 
int ENA=5; 
int flag=0;
#include <SPI.h>
String load="";
String micro="";
char buf [10];
volatile byte pos;
volatile bool process_it;
char c;
char f;
unsigned long int time;
float measure;
String comando="";
float oldmeasure;
String segno="";
String valore="";

void setup() {
    
  pinMode (PUL, OUTPUT);
  pinMode (DIR, OUTPUT);
  pinMode (ENA, OUTPUT);  
  Serial.begin (9600);  
  SPCR |= bit (SPE);
  pinMode (MISO, OUTPUT); 
  pos = 0;   
  process_it = false;
  SPI.attachInterrupt();
  

}

void loop() {
  
  
 while (Serial.available() > 0) {

    char inChar = Serial.read();
    comando =comando+inChar;
  }
    
  
  
  
  
   

  
   if (comando=="p"){
     comando="";
     stepDirection = -1;
     step();
   }
   else if (comando=="q"){
     comando="";
     stepDirection = 1;
     step();
   }
   else if(comando.substring(0,1)=="$"){
     if(comando.length()>4){
       segno=comando.substring(1,2);
       valore=comando.substring(2,5);
       val= valore.toInt();
       comando="";
       if(segno=="+"){forward();}
       if(segno=="-"){reverse();}
     }
   }
   else if(comando.length() > 0 && comando.substring(0,1) != "$"){
     // Flush comandi non riconosciuti per evitare accumulo nel buffer
     comando="";
   }



     
     
   

} 


//---------------------------------------------------------------------------

void readmicro(){

  if (process_it){
    
buf [pos] = 0;    
load=buf;
if(load.substring(0,1)=="#"){
if(load.substring(3,4)=="."){
if(load.substring(1,2)!="" & load.substring(1,2)!="."){ 
if(load.substring(2,3)!="" & load.substring(2,3)!="."){   
if(load.substring(4,5)!="" & load.substring(4,5)!="."){   
if(load.substring(5,6)!="" & load.substring(5,6)!="."){
micro=load.substring(1,6);
measure=micro.toFloat();

}
}
}
}
}
}

  
pos = 0;
process_it = false;
} 

}
//--------------------------------------------------------------------------
ISR (SPI_STC_vect){

byte c = SPDR;
if (pos < sizeof buf)
    {
buf [pos++] = c;

if (c == '#')
process_it = true;

    }
else {
    pos = 0;           // safety: reset su overflow per evitare blocco permanente
    process_it = false;
    }
}  


void step(){
  
  microtime=millis();
  
 if( stepDirection==-1){
  for (int i=0; i<32; i++)  {      
    digitalWrite(DIR,HIGH);
    digitalWrite(ENA,HIGH);
    digitalWrite(PUL,HIGH);
    delayMicroseconds(50);
    digitalWrite(PUL,LOW);
    delayMicroseconds(50);
  }
  }
  
  
  
  if( stepDirection==1){
  for (int i=0; i<32; i++)  {      
   digitalWrite(DIR,LOW);
   digitalWrite(ENA,HIGH);
   digitalWrite(PUL,HIGH);
   delayMicroseconds(50);
   digitalWrite(PUL,LOW);
   delayMicroseconds(50);
  }
  }
  
 while(millis() < microtime+900){
   
  readmicro();
  
 } 
 
 
 
 Serial.println(measure); 
 
  
Serial.println("*se");  

  
  
}  

void forward(){
  
  
for( int w=1;w<=val;w++){
  for (int i=0; i<32; i++)  {      
    digitalWrite(DIR,HIGH);
    digitalWrite(ENA,HIGH);
    digitalWrite(PUL,HIGH);
    delayMicroseconds(50);
    digitalWrite(PUL,LOW);
    delayMicroseconds(50);
  }
}
}

void reverse(){
  
  for( int w=1;w<=val;w++){

 for (int i=0; i<32; i++)  {      
   digitalWrite(DIR,LOW);
   digitalWrite(ENA,HIGH);
   digitalWrite(PUL,HIGH);
   delayMicroseconds(50);
   digitalWrite(PUL,LOW);
   delayMicroseconds(50);
  }  
  }
  }
  
  
  
  
  

