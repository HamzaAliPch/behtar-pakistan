-- CreateTable
CREATE TABLE "Country" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "AdministrativeRegion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "countryCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    CONSTRAINT "AdministrativeRegion_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMING_SOON',
    "reportingAdapter" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "City_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "AdministrativeRegion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LocationDistrict" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "LocationDistrict_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Locality" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "districtId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'LOCALITY',
    "parentId" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Locality_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "LocationDistrict" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Locality_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Locality" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Add nullable links without replacing the existing complaint table.
ALTER TABLE "Complaint" ADD COLUMN "cityId" TEXT REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Complaint" ADD COLUMN "districtRecordId" TEXT REFERENCES "LocationDistrict"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Complaint" ADD COLUMN "localityId" TEXT REFERENCES "Locality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Complaint" ADD COLUMN "locationNeedsReview" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX "Complaint_cityId_status_idx" ON "Complaint"("cityId", "status");
-- CreateIndex
CREATE UNIQUE INDEX "AdministrativeRegion_countryCode_name_key" ON "AdministrativeRegion"("countryCode", "name");

-- CreateIndex
CREATE UNIQUE INDEX "City_slug_key" ON "City"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "LocationDistrict_cityId_name_key" ON "LocationDistrict"("cityId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Locality_districtId_name_key" ON "Locality"("districtId", "name");

-- Initial coverage: only Karachi is operational. No financial allocation is inferred.
INSERT INTO Country (code,name) VALUES ('PK','Pakistan');
INSERT INTO AdministrativeRegion (id,countryCode,name,kind) VALUES ('sindh','PK','Sindh','PROVINCE');
INSERT INTO AdministrativeRegion (id,countryCode,name,kind) VALUES ('punjab','PK','Punjab','PROVINCE');
INSERT INTO AdministrativeRegion (id,countryCode,name,kind) VALUES ('kp','PK','Khyber Pakhtunkhwa','PROVINCE');
INSERT INTO AdministrativeRegion (id,countryCode,name,kind) VALUES ('balochistan','PK','Balochistan','PROVINCE');
INSERT INTO AdministrativeRegion (id,countryCode,name,kind) VALUES ('ict','PK','Islamabad Capital Territory','CAPITAL_TERRITORY');
INSERT INTO AdministrativeRegion (id,countryCode,name,kind) VALUES ('ajk','PK','Azad Jammu and Kashmir','ADMINISTRATIVE_TERRITORY');
INSERT INTO AdministrativeRegion (id,countryCode,name,kind) VALUES ('gb','PK','Gilgit-Baltistan','ADMINISTRATIVE_TERRITORY');
INSERT INTO City (id,slug,name,regionId,status,reportingAdapter,updatedAt) VALUES ('karachi','karachi','Karachi','sindh','ACTIVE','KARACHI_V1',CURRENT_TIMESTAMP);
INSERT INTO City (id,slug,name,regionId,status,reportingAdapter,updatedAt) VALUES ('lahore','lahore','Lahore','punjab','COMING_SOON',NULL,CURRENT_TIMESTAMP);
INSERT INTO City (id,slug,name,regionId,status,reportingAdapter,updatedAt) VALUES ('islamabad','islamabad','Islamabad','ict','COMING_SOON',NULL,CURRENT_TIMESTAMP);
INSERT INTO City (id,slug,name,regionId,status,reportingAdapter,updatedAt) VALUES ('peshawar','peshawar','Peshawar','kp','COMING_SOON',NULL,CURRENT_TIMESTAMP);
INSERT INTO City (id,slug,name,regionId,status,reportingAdapter,updatedAt) VALUES ('quetta','quetta','Quetta','balochistan','COMING_SOON',NULL,CURRENT_TIMESTAMP);
INSERT INTO City (id,slug,name,regionId,status,reportingAdapter,updatedAt) VALUES ('multan','multan','Multan','punjab','COMING_SOON',NULL,CURRENT_TIMESTAMP);
INSERT INTO LocationDistrict (id,cityId,name,sourceUrl) VALUES ('karachi-central','karachi','Central','https://commissionerkarachi.gos.pk/area-map');
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-central-0','karachi-central','Gulberg','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-central',localityId='karachi-central-0',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='Central' AND area='Gulberg';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-central-1','karachi-central','Liaquatabad','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-central',localityId='karachi-central-1',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='Central' AND area='Liaquatabad';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-central-2','karachi-central','Nazimabad','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-central',localityId='karachi-central-2',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='Central' AND area='Nazimabad';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-central-3','karachi-central','New Karachi','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-central',localityId='karachi-central-3',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='Central' AND area='New Karachi';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-central-4','karachi-central','North Nazimabad','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-central',localityId='karachi-central-4',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='Central' AND area='North Nazimabad';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-central-5','karachi-central','Federal B Area','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-central',localityId='karachi-central-5',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='Central' AND area='Federal B Area';
INSERT INTO LocationDistrict (id,cityId,name,sourceUrl) VALUES ('karachi-east','karachi','East','https://commissionerkarachi.gos.pk/area-map');
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-east-0','karachi-east','Ferozabad','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-east',localityId='karachi-east-0',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='East' AND area='Ferozabad';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-east-1','karachi-east','Gulshan-e-Iqbal','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-east',localityId='karachi-east-1',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='East' AND area='Gulshan-e-Iqbal';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-east-2','karachi-east','Gulzar-e-Hijri','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-east',localityId='karachi-east-2',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='East' AND area='Gulzar-e-Hijri';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-east-3','karachi-east','Jamshed Quarters','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-east',localityId='karachi-east-3',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='East' AND area='Jamshed Quarters';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-east-4','karachi-east','Gulistan-e-Johar','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-east',localityId='karachi-east-4',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='East' AND area='Gulistan-e-Johar';
INSERT INTO LocationDistrict (id,cityId,name,sourceUrl) VALUES ('karachi-south','karachi','South','https://commissionerkarachi.gos.pk/area-map');
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-south-0','karachi-south','Aram Bagh','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-south',localityId='karachi-south-0',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='South' AND area='Aram Bagh';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-south-1','karachi-south','Civil Lines','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-south',localityId='karachi-south-1',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='South' AND area='Civil Lines';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-south-2','karachi-south','Garden','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-south',localityId='karachi-south-2',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='South' AND area='Garden';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-south-3','karachi-south','Lyari','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-south',localityId='karachi-south-3',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='South' AND area='Lyari';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-south-4','karachi-south','Saddar','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-south',localityId='karachi-south-4',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='South' AND area='Saddar';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-south-5','karachi-south','Clifton','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-south',localityId='karachi-south-5',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='South' AND area='Clifton';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-south-6','karachi-south','Defence','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-south',localityId='karachi-south-6',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='South' AND area='Defence';
INSERT INTO LocationDistrict (id,cityId,name,sourceUrl) VALUES ('karachi-west','karachi','West','https://commissionerkarachi.gos.pk/area-map');
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-west-0','karachi-west','Manghopir','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-west',localityId='karachi-west-0',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='West' AND area='Manghopir';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-west-1','karachi-west','Mominabad','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-west',localityId='karachi-west-1',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='West' AND area='Mominabad';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-west-2','karachi-west','Orangi Town','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-west',localityId='karachi-west-2',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='West' AND area='Orangi Town';
INSERT INTO LocationDistrict (id,cityId,name,sourceUrl) VALUES ('karachi-korangi','karachi','Korangi','https://commissionerkarachi.gos.pk/area-map');
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-korangi-0','karachi-korangi','Korangi','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-korangi',localityId='karachi-korangi-0',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='Korangi' AND area='Korangi';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-korangi-1','karachi-korangi','Landhi','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-korangi',localityId='karachi-korangi-1',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='Korangi' AND area='Landhi';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-korangi-2','karachi-korangi','Model Colony','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-korangi',localityId='karachi-korangi-2',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='Korangi' AND area='Model Colony';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-korangi-3','karachi-korangi','Shah Faisal Colony','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-korangi',localityId='karachi-korangi-3',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='Korangi' AND area='Shah Faisal Colony';
INSERT INTO LocationDistrict (id,cityId,name,sourceUrl) VALUES ('karachi-malir','karachi','Malir','https://commissionerkarachi.gos.pk/area-map');
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-malir-0','karachi-malir','Malir','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-malir',localityId='karachi-malir-0',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='Malir' AND area='Malir';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-malir-1','karachi-malir','Airport','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-malir',localityId='karachi-malir-1',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='Malir' AND area='Airport';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-malir-2','karachi-malir','Bin Qasim','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-malir',localityId='karachi-malir-2',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='Malir' AND area='Bin Qasim';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-malir-3','karachi-malir','Gadap','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-malir',localityId='karachi-malir-3',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='Malir' AND area='Gadap';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-malir-4','karachi-malir','Ibrahim Hyderi','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-malir',localityId='karachi-malir-4',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='Malir' AND area='Ibrahim Hyderi';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-malir-5','karachi-malir','Murad Memon','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-malir',localityId='karachi-malir-5',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='Malir' AND area='Murad Memon';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-malir-6','karachi-malir','Shah Mureed','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-malir',localityId='karachi-malir-6',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='Malir' AND area='Shah Mureed';
INSERT INTO LocationDistrict (id,cityId,name,sourceUrl) VALUES ('karachi-keamari','karachi','Keamari','https://commissionerkarachi.gos.pk/area-map');
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-keamari-0','karachi-keamari','Keamari','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-keamari',localityId='karachi-keamari-0',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='Keamari' AND area='Keamari';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-keamari-1','karachi-keamari','Baldia Town','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-keamari',localityId='karachi-keamari-1',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='Keamari' AND area='Baldia Town';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-keamari-2','karachi-keamari','Harbor','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-keamari',localityId='karachi-keamari-2',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='Keamari' AND area='Harbor';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-keamari-3','karachi-keamari','Maripur','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-keamari',localityId='karachi-keamari-3',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='Keamari' AND area='Maripur';
INSERT INTO Locality (id,districtId,name,sourceUrl,updatedAt) VALUES ('karachi-keamari-4','karachi-keamari','SITE','https://commissionerkarachi.gos.pk/area-map',CURRENT_TIMESTAMP);
UPDATE Complaint SET cityId='karachi',districtRecordId='karachi-keamari',localityId='karachi-keamari-4',locationNeedsReview=CASE WHEN areaSource='MANUAL' THEN true ELSE false END WHERE district='Keamari' AND area='SITE';
INSERT INTO AuditLog (id,action,targetType,targetId,details) VALUES ('migration-location-catalog','LOCATION_CATALOG_MIGRATED','City','karachi','Exact district/locality matches linked. Unmatched historical locations retained for review. No coordinates, finances, roles or sessions changed.');
