// SPDX-License-Identifier: MIT
// Part of Mancer's contracts kit as the SDK uses it, mirrored with the rest of this repository at each release.
import { toFunctionSelector } from 'viem'
import type { Address, Hex } from 'viem'

export interface CodePinnedAddress {
  address: Address
  runtimeCodeHash: Hex
}

export interface SafeLaunchPadDeployment {

  pad: CodePinnedAddress

  adapter: CodePinnedAddress
}

export interface LaunchAdapterDeployment {
  generation: 'v3'

  router: CodePinnedAddress
  orders: CodePinnedAddress

  coordinator?: CodePinnedAddress
  coordinatorAllowanceTarget?: CodePinnedAddress
  ponsV2?: {
    factory: CodePinnedAddress
    adapter: CodePinnedAddress
  }
  safeLaunchV2Pads: readonly SafeLaunchPadDeployment[]
}

export const PONS_V2_ADAPTER_SELECTORS = [
  toFunctionSelector('buy(address,address,uint256,uint256)'),
  toFunctionSelector('sell(address,address,uint256,uint256)'),
] as const

export const SAFE_LAUNCH_V2_ADAPTER_SELECTORS = [
  toFunctionSelector('buy(uint256,address,uint256,uint256)'),
  toFunctionSelector('sell(uint256,address,uint256,uint256)'),
] as const

export const MANCER_LAUNCH_ADAPTER_V2_ARCHIVE: Readonly<
  Record<number, Omit<LaunchAdapterDeployment, 'generation' | 'router' | 'orders'> | undefined>
> = {
  4663: {
    coordinator: {
      address: '0xABFe4e6dbCbF1468e6e50C2c2223A91EB8c43b18',
      runtimeCodeHash: '0x1ff942f8a6bb490abb3b51520045f0642fdd6228f73a821bba4ddc440c07affe',
    },
    coordinatorAllowanceTarget: {
      address: '0xB6eD263f8eb5490CF53a880B2c4986C71654BEE4',
      runtimeCodeHash: '0x2b61da185aa969985b93998800cf2d6b2583cee4f937ef297e4216f554af4af9',
    },
    ponsV2: {
      factory: {
        address: '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e',
        runtimeCodeHash: '0x89a27da6f703e0a7cdd4f233e7cb57604ff75b164530962d3ff7cf8483a67d84',
      },
      adapter: {
        address: '0x029fe248f60C7E04a53b8D1B03996A69BD66BdD9',
        runtimeCodeHash: '0xe795f76d7145fa807b88aade830156a7a077cff8487b223f413ae2d37d033493',
      },
    },
    safeLaunchV2Pads: [
      {
        pad: {
          address: '0xFCd61B25BbF3AbD6cf0070D6328E351cc30EEC9f',
          runtimeCodeHash: '0x6d345abfc9ebfb122a37f7bdda83f21feafe575501a9ac0df56116739edf653f',
        },
        adapter: {
          address: '0x6f120Ea429a9fe8b27Ddb49a63987Ec829DC6075',
          runtimeCodeHash: '0xd9a171ba0f2634e2354df44f251cbd03a9b683ea921f5a20475613023a5d7315',
        },
      },
      {
        pad: {
          address: '0x8f6782c5Aa37804d08a9b7bf3984Ff3245Fd6cD4',
          runtimeCodeHash: '0xd668fca053f7a82cfeb38a9afd2a57829c90236ba42e470fe1be87fc66437133',
        },
        adapter: {
          address: '0xb2fC2Fd9d6F17A7C7c94E939d9ed3B11B9437A80',
          runtimeCodeHash: '0x5042b76ec26835140276989378fba26b289c865cba96df5e4970b569547079c9',
        },
      },
      {
        pad: {
          address: '0xd4F20033586977A2511f4A2DB4aF7C79a340D70a',
          runtimeCodeHash: '0xb3ad0eb6e6cb6fc11ec113a0126a8ecaf5f671f184b2445bc7c61d94026d36ab',
        },
        adapter: {
          address: '0x7d28F31C3Cec445b2C3d20dCe81d45BE3F4C84F9',
          runtimeCodeHash: '0x5aae91906e71a4ee393167ca9a85bb798cf3171b8366297e5a90a5b7727e3b25',
        },
      },
      {
        pad: {
          address: '0x4B9Dcd6CCFAeF0f6D23065Dd78E79d5E20ec8cFD',
          runtimeCodeHash: '0x1d7487e74ff0efbf5e51a622d34b96cbfaf45a8cdc7c25f8b7693fc8c6259afe',
        },
        adapter: {
          address: '0x6f81388c672ED20B8928C17D867ED2a1f72C8Af5',
          runtimeCodeHash: '0xc4c8a287bd63703cdf4edcb3d11eef45321cae9520b058e8450b23d89a7a2dc3',
        },
      },
      {
        pad: {
          address: '0xEe96d955d5634813374ecE4C74F2C0ff71B1F9fB',
          runtimeCodeHash: '0x742a8791f25ca25df3211e502b8fdf414d8f4ac4b53b7dcea9036216e98d1fb8',
        },
        adapter: {
          address: '0x68c83b009475c84B6218010D4BBa85F04f9fdB67',
          runtimeCodeHash: '0x46e5a479ed81a9a7777db7eef5e092c37e5854f1e2c0243a89e1c9950a741058',
        },
      },
      {
        pad: {
          address: '0xB0453A81Cbf963903409FFF18AD92941e1c7a864',
          runtimeCodeHash: '0x657f47f2a463ec6e37224eee7d7d153b6a2861bf926e2cddeba2ec23b15e709e',
        },
        adapter: {
          address: '0x46d3a2E7120ECE380CEe1Bbb7900f597A26BB839',
          runtimeCodeHash: '0xcff01eb8d3bb50b8ade372e0af3a3505f080b03bb57369b3be330f48297c1998',
        },
      },
      {
        pad: {
          address: '0x0c3b4EDED41696eFF0ed70841f132B519d81c947',
          runtimeCodeHash: '0x9d5be52846764d437e991d78d881c00186524c9d476b8282d77096aa31f59281',
        },
        adapter: {
          address: '0x45D782D095Ee0f6A38b9005d937A321a51177E81',
          runtimeCodeHash: '0x8510685605e836a21935130f23d967f201527a3fe8fe3038be0ad0fdf0555a40',
        },
      },
      {
        pad: {
          address: '0xDb3C81C841ff88db6cDFbDDB0eE049D162A6053B',
          runtimeCodeHash: '0x270f9fa42df3050d59b6a4c11974f899a1c404171838499a13d07f9b1ff96881',
        },
        adapter: {
          address: '0xEb2dEAfa131f35D54184815c81aa81f91C1716a5',
          runtimeCodeHash: '0xfb035e46b975a9ad2c95c9694b8c4bc43ec855f5914e1ad40d9dfa1997db0284',
        },
      },
      {
        pad: {
          address: '0x472a1AB6aEB77E3479193FBe83b718f9Bf5F8604',
          runtimeCodeHash: '0xf21207e73706e42645be6dba3fc47c45b7c248abb4f2f5d6710bec595501d618',
        },
        adapter: {
          address: '0xE06ccf3b1c7A99B86D532338C39A6244D23f4B63',
          runtimeCodeHash: '0x2238404b19b3cc0d7baf2e8f6e94fb8b96c1843b81e8a9fb627a8be65e2f2342',
        },
      },
      {
        pad: {
          address: '0x5BCEefBa6fDf437A7388aDC5c9056c827baca3B3',
          runtimeCodeHash: '0x3b0e988202d0771b28575ae60b5437900cd815f0b4c346f40c06b9c2f804e5f2',
        },
        adapter: {
          address: '0x214777a9747541C8aEea38027207A3EC790eCbf5',
          runtimeCodeHash: '0xedd6de51887e27b4b58ef56cea2fef681ff8ec0579afb53484891bcc892016f8',
        },
      },
      {
        pad: {
          address: '0x406fd0B957bb8cF1dd57C78540D009578e971131',
          runtimeCodeHash: '0xee0f89bcd96c5be40038a2b03671f4f50e63d8bd6d381f223aa0f07c1458a523',
        },
        adapter: {
          address: '0x36296F02991f1A04Fca7e7Af2FF2fA925821E566',
          runtimeCodeHash: '0x39f681c4b77e3b4d42bef6b3858f9abc62b2e34b819c82526bbeb723280f2e7d',
        },
      },
      {
        pad: {
          address: '0xF0A06Ac7BBb0cc3049B68c257c3ee27CcEA40eeA',
          runtimeCodeHash: '0xca2126b838c64d3ff1cf4c985c053b3903c5c04a391b7e3a639b651713a77e7e',
        },
        adapter: {
          address: '0x66c597346CF03b9386aB8222aF439ba0ab8403D2',
          runtimeCodeHash: '0xf9795872bcfd50a2aabdb754f786a70099052352b90fbaa47cbeeb0663471d17',
        },
      },
      {
        pad: {
          address: '0x5b21F8a5Ef81586627B4725844aD447325d0992B',
          runtimeCodeHash: '0x2140f62e3d47e6d4f7111c992629e39646f73aacb0e0a7c2d527880a089407c5',
        },
        adapter: {
          address: '0x0dd2AA335DbF55b660bf32fdc1117f37AF544cff',
          runtimeCodeHash: '0x836d65e7240b225cf7884f63969c4c88f0cfb3cbad46416a0b27c5900ab08ed5',
        },
      },
      {
        pad: {
          address: '0xDf03953DCA8dB733345278A0c5fd2E81fa2A9B54',
          runtimeCodeHash: '0x1299cc4c3c3d11ebe726c668368887d190b44a91a0d972ca8955a9e59e54d488',
        },
        adapter: {
          address: '0x320653DD8C0bb61E6a7d2434110A2B89C38142Da',
          runtimeCodeHash: '0xb26967631fca4ee6ec5d30e7659b664f037c9a404c9e83b649d570bd72410bd0',
        },
      },
      {
        pad: {
          address: '0xc522DfaE0D1a140257702392B665183a6De7657f',
          runtimeCodeHash: '0x42b3ec94077c1a4e718d8386544899f1368ea3a0658502e361df04e3fb4e0733',
        },
        adapter: {
          address: '0x8BE2200Cf11954583003998234750b7a69F2Dfc5',
          runtimeCodeHash: '0x77af462eb2789d0b1f585ed1d95bb7f7719e6c7ea01071d76a589dbf5dcbfc3b',
        },
      },
      {
        pad: {
          address: '0xd82da1D8ef59959b170b59147283Ab1F2F1Ca86A',
          runtimeCodeHash: '0x82ee2c01f148f5a5c2cefdbe79ff860d0638a0c651f5da44a63f1d8c1643f91d',
        },
        adapter: {
          address: '0x824cE32b6261711E7ADeE6052b01402BA921C8f8',
          runtimeCodeHash: '0x81d544acd12fca1a88a9dd37466045c8e52024d5410acb93fada073e9f1a065c',
        },
      },
      {
        pad: {
          address: '0x644b19512052A1b6d38d7B16C6c3Fb1d3F7270D2',
          runtimeCodeHash: '0xa35e6dcc29487f1c07054d46f38c2e883dab842dab18aed46640fc32d166ee99',
        },
        adapter: {
          address: '0xE9612b01D475344aec596d120D8F194F55b5D171',
          runtimeCodeHash: '0x93ac7eb7de78ff0932459376147e05a83aa7efcd7523d27be2030d135014feb8',
        },
      },
      {
        pad: {
          address: '0x2bd7F90cca4660da82aa693cF352dDB6275C76dA',
          runtimeCodeHash: '0xf21207e73706e42645be6dba3fc47c45b7c248abb4f2f5d6710bec595501d618',
        },
        adapter: {
          address: '0xe7441391A0631F2AB2a7E6bf228833BEA1Ec19B4',
          runtimeCodeHash: '0x84584acfcdeea72965fa7ca42ba7d3d4f16cdc17c856eb59bbf2adfa96f53892',
        },
      },
    ],
  },
  46630: undefined,
}

export const MANCER_LAUNCH_V3_DEPLOYED_AT_BLOCK = 49_579_357n

const MANCER_LAUNCH_V3_SAFE_LAUNCH_ADAPTERS = [
  { address: '0x4B394e1Bd42B0Bb97Edf756c586A587D9277a3A8', runtimeCodeHash: '0x9a6ee9aa6ba721fb17d1ba4c66e12aa1efc8d8b8e249a70a83723f33d8f956e4' },
  { address: '0x90C1fB360F7f915Da407696cd71a9a6d71B65836', runtimeCodeHash: '0x83d2d2c1c45c800e5b6c7d2c70e19411c8ffd27580ebcef501ce305b8bbd939d' },
  { address: '0x17d9B970737671e3e349f40a1f911f89f56447Ac', runtimeCodeHash: '0xb451a734a575d569549af965cd4a10494a8d449ba6550c3b4cb354fb7549c224' },
  { address: '0x27E384e7A1332fC158c25137c6414d911bA5eD8d', runtimeCodeHash: '0x9c17f263587e3a6d2fbafdcf11d3a10ab52255d16daa62bcfaceffef51e08246' },
  { address: '0xaC95C283FC6a8f29CCD8F31B0aE8c6990b8efd47', runtimeCodeHash: '0x8506c98757b49f05a5a9d9a951ed264b8d4eed59b378090dad9078fe1b268853' },
  { address: '0x151242A10FfBF40ea8aEBc46bF2EEd43050E311b', runtimeCodeHash: '0x0bfa60010a7478041260b9f4e1b586ee720231f840307a7e454fe1ddc85ab831' },
  { address: '0x26c6EBBfEf6325587F9611e8A60b1C8e7d0eB83B', runtimeCodeHash: '0xfdd6c97a7a9118ee1f1c7c1ddd17cf50eb2d923f034fd2d63fa24183e09fba74' },
  { address: '0x3AE5997C9421f8beA28B4B63E34Ef1b2ba633a24', runtimeCodeHash: '0xcb241bf160bbb7a28c1957a6ef5d99fd6639f8a21ad7055d32fa6e60aae495e1' },
  { address: '0x7438c6c725a394b31e725b8D513b41c79265979F', runtimeCodeHash: '0xf69c6aea2989ea69957745fefda7b9f66d61b328ca08cd0a20e85253c6ae20bf' },
  { address: '0xE2F07B65A845FAc4432AC9248166A4cce3014336', runtimeCodeHash: '0x6db4bd942893fdcc314bdb3d43b9c240ed7c6b65b28aa050718acc3142b59bde' },
  { address: '0x169704629293161638f927D75088aD349C8b2fbC', runtimeCodeHash: '0x5c33491895900b6e39931ef111f324dce0732796c0c356f63051879893ed36d1' },
  { address: '0x127bcaBC4F5B69B1a3ce0c7C15D6c06EAe63fdcb', runtimeCodeHash: '0xa898250a1feadce34a6212f827312e81cb30b6aae3b35bbf6727f6b10cc1a58a' },
  { address: '0x6584ee499077bb00f0CBbba195C9650141B17ffD', runtimeCodeHash: '0x7d24a946e06888f71577ccd4db79a99093a919ddc9183ff38dc7aaa3615be705' },
  { address: '0x4d83E4191F5cEdC9d7f98150933E013219F51350', runtimeCodeHash: '0x654412648d43fcea16a4ea0033b03b4437fcce8181421522600161024b44c819' },
  { address: '0xE8FC56Cee7Fc45E2D4649879Ae3CdC5eB66418fd', runtimeCodeHash: '0xae7d4f96a4391aec18bb58619e974b639094c6b3063f44715a78098733d0bb88' },
  { address: '0x1fc30Ec413595ac8DcF86F9ecfF468A46273F7A5', runtimeCodeHash: '0xeccf3e2753d33e4e9bb63b625d61a5959efbfda1941d5262befbeb52bbc0ce34' },
  { address: '0xa2BcB57BbD0740397a3748577Be490a223BfA714', runtimeCodeHash: '0x73b306ad27a9773a07a58131ceadecb3c35e53b6e16639a75256278afd949092' },
  { address: '0x1f86F85FCF2473af77FdA4781263DbF155A5c9A7', runtimeCodeHash: '0xc87fbfd7bb22075352dd85d53e02583e85c10913e193837f0b73dba8274b3502' },
] as const satisfies readonly CodePinnedAddress[]

export const MANCER_LAUNCH_ADAPTER_DEPLOYMENTS: Readonly<
  Record<number, LaunchAdapterDeployment | undefined>
> = {
  4663: {
    generation: 'v3',
    router: {
      address: '0xa62858659C83095Eb5E702f0Af6a7Bb7F370B3e7',
      runtimeCodeHash: '0x6f7e1b7c12c4f744d3ff28fca581921728a5e66155fa8ba9628aafe08fdf9064',
    },
    orders: {
      address: '0xf300A6549Cd46206629e6719d3f258022d7F2da1',
      runtimeCodeHash: '0x630145f26ba1a3bff17a536857dbd1fa259f4194be2adb930558810245217439',
    },
    coordinator: {
      address: '0xF5a39FE1b86C533F471d0e48dc0280804B8DDF69',
      runtimeCodeHash: '0x1ec170ede1f3d3e9a06d44f045f320a4276410d5f9d88cdc60212c832421355f',
    },
    coordinatorAllowanceTarget: {
      address: '0x9D356d32Df8a7463E8D73e26021e0dd8fdB7c65C',
      runtimeCodeHash: '0xacf056eb923a69c9f9567dca28757c3ce9e37e71b98181e3291ce8c7e8385b02',
    },
    ponsV2: {
      factory: {
        address: '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e',
        runtimeCodeHash: '0x89a27da6f703e0a7cdd4f233e7cb57604ff75b164530962d3ff7cf8483a67d84',
      },
      adapter: {
        address: '0x32bbB7E6c6ecfB4fa1944774842287319dFCFcD8',
        runtimeCodeHash: '0x8782192053b5a6f62c67e4e6276249a9c146e3a5fcf33c95e22d11702fea06b3',
      },
    },
    safeLaunchV2Pads: MANCER_LAUNCH_ADAPTER_V2_ARCHIVE[4663]!.safeLaunchV2Pads.map((deployment, index) => ({
      pad: deployment.pad,
      adapter: MANCER_LAUNCH_V3_SAFE_LAUNCH_ADAPTERS[index]!,
    })),
  },
  46630: undefined,
}

export function launchAdapterDeployment(chainId: number): LaunchAdapterDeployment | undefined {
  return MANCER_LAUNCH_ADAPTER_DEPLOYMENTS[chainId]
}
