import React, { useState } from "react";
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { LocalCatalogService } from "@/lib/services/local-catalog.service";
import { usePosTheme } from "@/lib/stores/ui-store";
import { useBusinessConfigStore } from "@/lib/stores/business-config-store";

export default function AddLocalProductScreen() {
  const theme = usePosTheme(); const router = useRouter();
  const mode = useBusinessConfigStore(state => state.configuration.operatingMode);
  const [name,setName] = useState(""); const [sku,setSku] = useState(""); const [barcode,setBarcode] = useState("");
  const [price,setPrice] = useState("0"); const [stock,setStock] = useState("0"); const [busy,setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await LocalCatalogService.create({ name,sku,barcode,price: Number(price),openingStock: Number(stock) }); router.back(); }
    catch(error:any) { Alert.alert("Add product",error?.message?.includes("UNIQUE") ? "That SKU or barcode is already in use." : error?.message ?? "Unable to create product"); }
    finally { setBusy(false); }
  };
  return <ScrollView style={{flex:1,backgroundColor:theme.background}} contentContainerStyle={{padding:24,alignItems:"center"}}><View style={{width:"100%",maxWidth:640,gap:14}}>
    <TouchableOpacity onPress={()=>router.back()}><Text style={{color:theme.accent}}>← Products</Text></TouchableOpacity>
    <Text style={{color:theme.text,fontSize:24,fontWeight:"800"}}>Add Local Product</Text>
    {mode !== "INDEPENDENT" ? <Text style={{color:theme.muted}}>OMS-dependent dealerships receive products from OMS. Local product creation is disabled.</Text> : <>
      {[["Product name",name,setName],["SKU",sku,setSku],["Barcode (optional)",barcode,setBarcode],["Selling price",price,setPrice],["Opening stock",stock,setStock]].map(([label,value,setter])=><View key={label as string}><Text style={{color:theme.text}}>{label as string}</Text><TextInput value={value as string} onChangeText={setter as (value:string)=>void} maxLength={255} style={{borderWidth:1,borderColor:theme.border,borderRadius:8,padding:12,marginTop:6,color:theme.text,backgroundColor:theme.surface}} /></View>)}
      <Text style={{color:theme.muted}}>This product stays in your dealership's local catalog and cloud database backups.</Text>
      <TouchableOpacity disabled={busy} onPress={()=>void save()} style={{padding:15,borderRadius:8,backgroundColor:theme.primary,opacity:busy ? 0.5 : 1}}><Text style={{color:theme.onPrimary,textAlign:"center",fontWeight:"700"}}>{busy?"Saving...":"Create Product"}</Text></TouchableOpacity>
    </>}
  </View></ScrollView>;
}
