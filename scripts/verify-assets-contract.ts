export interface ExpectedAsset {
	readonly id: string;
	readonly distributionPath: string;
	readonly sourcePath: string;
	readonly packageMember?: string | undefined;
	readonly sha256: string;
	readonly bytes: number;
	readonly role: string;
	readonly licenseStatus: string;
	readonly width?: number | undefined;
	readonly height?: number | undefined;
	readonly colorType?: number | undefined;
}

export const EXPECTED_ASSETS: readonly ExpectedAsset[] = [
	{
		id: "kch-wordmark",
		distributionPath: "assets/logos/KCH_LOGOV2.png",
		sourcePath: "logo/KCH_LOGOV2.png",
		sha256: "29cc7d183efe7aa7b560f0778743dcc97b2b0b127399805f3da812efa9b4742d",
		bytes: 8201,
		role: "KCH corporate wordmark",
		licenseStatus: "internal-use-only",
		width: 458,
		height: 246,
		colorType: 2,
	},
	{
		id: "k-mark",
		distributionPath: "assets/logos/K_LOGO.png",
		sourcePath: "logo/K_LOGO.png",
		sha256: "e10c23ecaed8ce689bec87a4f811df5b7760a7a9c66d4c28a7f86da3d0f28cc2",
		bytes: 4293,
		role: "KCH standalone K mark",
		licenseStatus: "internal-use-only",
		width: 162,
		height: 243,
		colorType: 6,
	},
	{
		id: "pretendard-regular",
		distributionPath: "assets/fonts/Pretendard-Regular.ttf",
		sourcePath: "font/pretendard/ttf/Pretendard-Regular.ttf",
		sha256: "6d0af5258997aec7354a6e340fc2325ba321c410ca48b3af858c8c3d6e92a324",
		bytes: 2725828,
		role: "Korean body font",
		licenseStatus: "SIL-OFL-1.1-with-bundled-license",
	},
	{
		id: "pretendard-bold",
		distributionPath: "assets/fonts/Pretendard-Bold.ttf",
		sourcePath: "font/pretendard/ttf/Pretendard-Bold.ttf",
		sha256: "c16b88c670d23e83fa1170c954cbc4822d3b8dad3c3cde15d798a94b43d97985",
		bytes: 2661752,
		role: "Korean heading font",
		licenseStatus: "SIL-OFL-1.1-with-bundled-license",
	},
	{
		id: "pretendard-black",
		distributionPath: "assets/fonts/Pretendard-Black.ttf",
		sourcePath: "font/pretendard/ttf/Pretendard-Black.ttf",
		sha256: "0a7c1fd65a599f9d25de860cc832ea9ac40c207775e33eb4344a4647392a2b5d",
		bytes: 2665004,
		role: "Korean display font",
		licenseStatus: "SIL-OFL-1.1-with-bundled-license",
	},
	{
		id: "pretendard-license",
		distributionPath: "assets/licenses/Pretendard-LICENSE.txt",
		sourcePath: "font/pretendard/LICENSE.txt",
		sha256: "b04538c9abec39a3db75108cf0af0fd9c77032fe8aa2cf38345b4d250e98e38e",
		bytes: 4419,
		role: "Pretendard redistribution license",
		licenseStatus: "SIL-OFL-1.1",
	},
	{
		id: "shinan-wind-bottom-panorama",
		distributionPath: "assets/panoramas/shinan-wind-bottom.png",
		sourcePath: "260514_신안 해상풍력 일반산업단지 사업보고_PF 조기상환기준.pptx",
		packageMember: "ppt/media/image2.png",
		sha256: "eaa69030ebd3c3b5268b9d7819f5c5468867c6c4bf0f946e00ffb30cf5873a16",
		bytes: 3457032,
		role: "wind-industrial lower panorama only",
		licenseStatus: "internal-use-only",
		width: 4397,
		height: 382,
		colorType: 6,
	},
];
