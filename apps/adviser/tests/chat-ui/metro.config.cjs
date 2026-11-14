const {getDefaultConfig}=require('expo/metro-config');const path=require('node:path');const c=getDefaultConfig(__dirname);c.watchFolders=[path.resolve(__dirname,'../..')];module.exports=c;
