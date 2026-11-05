import { OFFICER_TRAITS, type Trait } from './traits';
import type { V03Locale as Locale } from '../wiki';

export type LineMoment =
  'charge' | 'rout' | 'duelStart' | 'duelWin' | 'duelLose' | 'captured' | 'victory';
export interface LinePair {
  en: string;
  zh: string;
}

type P = readonly [en: string, zh: string];
/** Legacy officers: charge, rout, duelStart, duelWin, duelLose, captured, victory. */
type Full = readonly [P, P, P, P, P, P, P];
/** Later officers: charge, duelStart (other moments fall back to traits). */
type Short = readonly [P, P];

const pair = ([en, zh]: P): LinePair => Object.freeze({ en, zh });

const FULL: Record<string, Full> = {
  caocao: [
    ['Forward! I would sooner wrong the world than be wronged!', '全军听令，随我向前！'],
    ['Retreat! I will drink again in Xuchang.', '撤！留得青山在，不怕没柴烧。'],
    ['Come, test the Prime Minister of Han.', '宁教我负天下人，休教天下人负我！'],
    ['A hero is only as good as his next victory.', '天下英雄，唯使君与操耳。'],
    ['Hm. I will remember this face.', '今日之败，操记下了。'],
    ['Kill me, or serve me. Choose quickly.', '要杀便杀，操不降亦不求。'],
    ['The empire is mine to mend.', '挟天子以令诸侯，天下可定！'],
  ],
  xiahoudun: [
    ['Charge! One eye is plenty to find you!', '全军冲锋，一目足矣！'],
    ['Fall back! Save the lord first!', '先护主公，快撤！'],
    ['Parents gave me this body. I will not waste it.', '父精母血，不可弃也！'],
    ['Not bad, but I have one eye less to blind.', '区区之辈，也敢挡我？'],
    ['Argh! Did my eye betray me again?', '可恨！是我失了准头！'],
    ['I bow to no one but Cao Cao.', '夏侯惇只认主公一人！'],
    ['Victory, and not one arrow in my eye this time.', '此战得胜，未再伤目！'],
  ],
  xunyu: [
    ['Advance in good order. Haste ruins plans.', '谋定而后动，进军！'],
    ['Preserve the army. We will return.', '保全兵力，以待后图。'],
    ['I prefer ink, but I can manage this.', '文若虽儒生，亦可一战。'],
    ['Order is always cheaper than force.', '以理服人，胜于刀兵。'],
    ['Pardon. I am not made for this.', '惭愧，非我所长。'],
    ['I serve Han. Do what you will.', '荀彧一心匡扶汉室。'],
    ['The realm moves one step closer to peace.', '天下安定，又近一步。'],
  ],
  caoren: [
    ['Hold the line and push! No step back!', '结阵向前，寸步不退！'],
    ['We fall back in order. Nothing is lost.', '有序后撤，阵脚不乱。'],
    ['I never lose a fortress, nor a duel.', '曹仁在此，岂容你放肆！'],
    ['Steady as a wall. As always.', '稳如磐石，不过如此。'],
    ['The wall cracked. Only once.', '今日一失，下回必雪。'],
    ['Take the city if you can. I will not yield.', '城可破，仁不可降！'],
    ['Another wall holds. Another victory.', '坚城未破，大捷！'],
  ],
  xiahouyuan: [
    ['Swift as a god! Strike before they blink!', '兵贵神速，随我冲杀！'],
    ['Withdraw! We outrun them, as always.', '撤！他们追不上我们。'],
    ['Three hundred li in two days; one duel is nothing.', '三日五百，六日一千！'],
    ['Too slow. Always too slow.', '太慢了，太慢了！'],
    ['You caught me? Impossible!', '竟有人比我还快？'],
    ['Pah! Fast horses do not fear chains.', '捉我容易，留我难！'],
    ['We were there before the news was.', '捷报未至，我军先到！'],
  ],
  chengyu: [
    ['Strike now. They will not expect it.', '出其不意，进攻！'],
    ['A little loss, a better plan. Withdraw.', '小损不足惜，退！'],
    ['I am a scholar, but I bite.', '程某虽老，亦能一战。'],
    ['Humph. Do not underestimate the old.', '莫欺老夫！'],
    ['Careless. I count on wit, not arms.', '老夫一时失算。'],
    ['Ask me nothing, and I shall tell you nothing.', '休想从我口中得半字。'],
    ['The plan worked. Is there any reward?', '计成功就，不知赏钱几何？'],
  ],
  yujin: [
    ['Discipline wins wars. Forward in rank!', '军纪严明，整队前进！'],
    ['Retreat in rank. No running.', '列阵撤退，不得溃走。'],
    ['Strict in command, strict in battle.', '治军严整，临阵亦然！'],
    ['Order beats rage.', '军法如山，岂容逆我。'],
    ['I failed. No excuse.', '败了便是败了。'],
    ['Do not ask me to beg.', '宁死不受辱！'],
    ['The army kept its rank. That is the victory.', '全军有序，此胜可贵。'],
  ],
  liubei: [
    ['For the people and the Han, advance!', '为百姓，为汉室，进军！'],
    ['Do not die for me. Retreat, all of you.', '诸君珍重，且退！'],
    ['I am a descendant of Prince Jing of Zhongshan.', '吾乃中山靖王之后。'],
    ['I take no joy in this. Rest now.', '胜之不喜，休怪备心狠。'],
    ['Heaven does not favor me today.', '天不佑我乎！'],
    ['Spare my men, and do with me as you will.', '放过我的将士，备任凭处置。'],
    ['The people can sleep tonight. That is enough.', '百姓安，备心足矣。'],
  ],
  guanyu: [
    ['Behold the beard of Guan Yunchang! Charge!', '关某在此，随我冲阵！'],
    ['Withdraw. The Green Dragon is not done.', '暂且退兵，来日再战。'],
    ['Pour the wine. It will still be warm.', '酒且斟下，某去去便回。'],
    ['Your head is mine, and the wine is still warm.', '酒尚温时，斩其首级！'],
    ['The Red Hare slowed. That is all.', '此乃马失，非关某之过。'],
    ['I would rather die than bow to you.', '玉可碎而不可改其白！'],
    ['Better to be proud than to be rushed.', '胜负兵家常事，何足道哉。'],
  ],
  zhangfei: [
    ['Rush them! No one holds against the Zhang clan!', '随我杀入敌阵！'],
    ['Retreat? Fine! I will be back, louder!', '撤就撤！俺回来再战！'],
    [
      'I am Zhang Yide of Yan! Who dares fight me to the death?',
      '燕人张翼德在此！谁敢与我决一死战？',
    ],
    ['Haha! Next one! Come on!', '痛快！下一个是谁？'],
    ['Argh! Who put a stone there?!', '哎呀！这是谁的石头？'],
    ['Let go! I need to hit someone!', '放开俺！俺还没打够！'],
    ['Wine! Everyone, wine!', '大哥，今日当痛饮三百杯！'],
  ],
  jianyong: [
    ['Forward! And do keep your helmet on.', '请诸位上前，务必戴好盔。'],
    ['Let us retreat; I shall explain it to the lord.', '且退，容我向主公解释。'],
    ['I speak better than I fight, but I will try.', '雍口才胜于武艺，然也一试。'],
    ['Lucky. Never tell Zhang Fei.', '侥幸，莫告诉翼德。'],
    ['That went as expected. Sadly.', '果然不出所料。'],
    ['Might I at least sit down while you interrogate me?', '且容我坐下再审如何？'],
    ['Victory, and a well-earned nap.', '大胜，该睡一觉了。'],
  ],
  sunjian: [
    ['Tiger of Jiangdong, forward!', '江东猛虎，随我杀敌！'],
    ['Pull back and regroup. I shall return.', '暂退，重整旗鼓。'],
    ['Sun Wentai of Wu! Come and die!', '吴郡孙文台在此！'],
    ['Another one for the Tiger!', '又一个，不过如此！'],
    ['Hmph, I was too hasty.', '轻敌了。'],
    ['The seal stays with me. Never.', '玉玺在我，休想夺去！'],
    ['The south bows to the Sun.', '江东之地，尽归于孙。'],
  ],
  sunce: [
    ['Little Conqueror leads! Follow me!', '小霸王在此，随我冲锋！'],
    ['Hold, I will cover the retreat.', '我来断后，诸君速撤。'],
    ['I am Sun Bofu! Step forward!', '孙伯符在此，来者通名！'],
    ['Easy. Next!', '爽快，下一个！'],
    ['Careless. Father fell much the same way.', '大意了，竟如父亲一般。'],
    ['I am not the type to bow.', '我孙策不跪人！'],
    ['Jiangdong is mine. All of it.', '江东基业，由此而定！'],
  ],
  huanggai: [
    ['A pained old man leads. Charge!', '老夫愿为先锋，进攻！'],
    ['Pull back. A little pain, a bigger plan.', '且退，为大计也。'],
    ['One willing to be beaten, another to beat.', '愿打愿挨，来吧！'],
    ['Old bones, sharp iron.', '老骨头，硬得很！'],
    ['I surely deserved that one.', '这一下，老夫领了。'],
    ['Do what you like. I have taken worse.', '更重的打老夫也受过。'],
    ['Fire and victory, hand in hand.', '火烧连营，大胜！'],
  ],
  chengpu: [
    ['Old officer of Jiangdong, forward!', '江东老将，随我进攻！'],
    ['Back. I am older, not stupider.', '退，老夫不蠢。'],
    ['I served three generations of Sun. Try me.', '服侍孙氏三代，来战！'],
    ['The old still know a few tricks.', '老将犹有三分力。'],
    ['Pah. My knees are not what they were.', '老了，腿脚不济。'],
    ['The Suns will not forget this.', '孙家必不会忘记今日！'],
    ['Wine for the young. I shall watch.', '后生们喝吧，老夫看着。'],
  ],
  handang: [
    ['Archers! Loose, then charge!', '放箭，然后冲锋！'],
    ['Pull back the bows!', '收弓，撤！'],
    ['Bow and blade, I carry both.', '弓刀俱备，来战！'],
    ['One arrow, one hit.', '一箭一中，不虚发。'],
    ['I missed? Did the wind change?', '失手了？风向变了。'],
    ['I surrender only to Jiangdong.', '韩当只降江东！'],
    ['We win by volley and steel.', '箭雨与钢刀，大胜！'],
  ],
  zuzhao: [
    ['Forward! Give me that red hat!', '冲啊！替主公断后！'],
    ['Retreat! Hang the hat on a post!', '撤！把帽子挂柱上！'],
    ["I wore my lord's hat. Come take it!", '来取我头上赤帻！'],
    ['Ha! They chased the hat.', '哈，他们只追这顶帽子。'],
    ['The hat fooled nobody.', '这帽子没骗到人。'],
    ['Spare me. It was a good hat.', '饶命，那可是顶好帽子。'],
    ['The hat survived. So did I.', '帽子保住了，人也保住了。'],
  ],
  yuanshao: [
    ['Four generations, three dukes. Forward!', '四世三公之后，进军！'],
    ['A tactical retreat. Quite magnificent.', '此乃战略转进，何等从容！'],
    ['I am Yuan Shao of the Yuan family! Kneel!', '吾乃四世三公袁本初！'],
    ['Naturally. I am Yuan Shao.', '理所当然，我乃袁本初。'],
    ['Why are my officers not helping?!', '诸将何在？为何不救！'],
    ['Do you know who I am? Untie me!', '你可知我是谁？快松绑！'],
    ['Of course we win. Look how well-dressed we are.', '兵多将广，岂有不胜？'],
  ],
  yanliang: [
    ['Yan Liang leads! All who stand die!', '颜良当先，挡者皆死！'],
    ["Back! Wait for the champion's return!", '且退，待我再战！'],
    ["Who will face Yuan's greatest champion?", '谁敢与河北上将一战？'],
    ["Next! I haven't even sweated.", '下一个，我汗都没出！'],
    ['Wait, whose red face is that?', '这红脸的是……'],
    ['I will say nothing.', '要杀便杀。'],
    ["Hebei's strength is not for show.", '河北雄兵，名不虚传！'],
  ],
  wenchou: [
    ['Wen Chou leads! Break their line!', '文丑在此，冲破敌阵！'],
    ['Pull back! My brother avenges us!', '且撤，来日雪耻！'],
    ['I match any hero in the land!', '天下英雄，谁敢与我一战！'],
    ['One more fool.', '又是一个送死的。'],
    ['Ugh! Even a tiger sometimes falls.', '虎有失蹄，大意了。'],
    ['I will not kneel, even for a horse.', '宁折不弯！'],
    ['Yan Liang would be proud.', '颜良兄，今日为你雪恨！'],
  ],
  zhanghe: [
    ['Strike where they are weakest!', '攻其无备，进军！'],
    ['Withdraw in good order; we shall try again.', '整队而退，再寻良机。'],
    ['Whichever lord I serve, I fight with all my heart.', '张郃既事一主，当尽全力。'],
    ['Skill, not luck.', '以巧破力，不过如此。'],
    ['That was well played. I yield.', '好手段，我认输。'],
    ['A good bird picks its tree.', '良禽择木而栖。'],
    ['The enemy was ready, but I was readier.', '敌有备，我更有备。'],
  ],
  tianfeng: [
    ['Do not advance! ... Fine, advance anyway.', '主公不听，也只好进了。'],
    ['I told you so. Retreat.', '我早说过了，撤吧。'],
    ['I was against this duel, but here we are.', '我本反对，既已至此。'],
    ['Even a victory can be an error.', '胜亦不足喜。'],
    ['See? I warned them.', '我早已提醒过。'],
    ['Better a prison cell than listening to flatterers.', '宁入牢狱，不听谗言。'],
    ['Please do not celebrate yet.', '不可高兴太早。'],
  ],
  jushou: [
    ['Hold your hands! ... Alas, advance.', '劝不住，进军吧。'],
    ['We must withdraw. I said so.', '我曾言必败，撤。'],
    ['Please, do not make me duel.', '请勿让我单挑，谢谢。'],
    ['I never wished to win by blade.', '并非我所愿。'],
    ["A strategist's hands are made for the brush.", '我手握的是笔。'],
    ['A loyal man serves one lord.', '忠臣不事二主。'],
    ['Victory is only the first act.', '此胜只是开局。'],
  ],
  guotu: [
    ['Forward! I will take the credit afterwards.', '先上，功劳回头算我的。'],
    ["That was Zhang He's fault. Retreat!", '都怪张郃，撤！'],
    ['Fine, I will fight. Hold my fan.', '拿着我的扇子。'],
    ['See? All my doing.', '全是我的功劳！'],
    ['Somebody else must have failed me.', '定是旁人拖累我。'],
    ['Please, I can be very useful to you.', '我可以为阁下效力！'],
    ['Naturally the plan was mine.', '这计当然是我出的。'],
  ],
  dongzhuo: [
    ['Burn it, loot it, and bring me wine!', '烧杀抢掠，酒肉备上！'],
    ["Retreat to Chang'an! Carry the gold!", '回长安，先搬金银！'],
    ['I am the Chancellor! Kneel before me!', '我乃相国，尔等跪下！'],
    ['Haha! More heads for the feast!', '哈哈，又添一颗人头！'],
    ['Who dares hurt a Chancellor?!', '谁敢伤相国！'],
    ['Wait, I have gold! Mountains of it!', '饶命，我有金山银山！'],
    ['Eat and drink. Tonight is for me.', '今日置酒，不醉不归！'],
  ],
  lubu: [
    ['Behold the Flying General! Charge!', '飞将在此，随我冲阵！'],
    ['Retreat?! No one stops me. My horse is just tired.', '非我不能战，马乏耳！'],
    ['Among men, Lü Bu. Among horses, Red Hare!', '人中吕布，马中赤兔！'],
    ['Who is next? I said, who is NEXT?', '还有谁？还有谁！'],
    ['Impossible! Nobody beats Lü Bu!', '不可能！天下无人能胜吾！'],
    ['Lord Cao! Do you not need a good general?', '明公难道不需猛将乎？'],
    ['No one under heaven can stop me.', '天下无敌，不过如此。'],
  ],
  jiaxu: [
    ['Strike. If it fails, I shall already be gone.', '进。若败，我已先走。'],
    ['Retreat quietly. I never lose.', '悄悄退，我从不败。'],
    ['A duel? How barbaric. Very well.', '比武？粗鄙。罢了。'],
    ['I merely stood here.', '我什么都没做。'],
    ['That is why I never duel.', '所以我从不比武。'],
    ['Whichever lord you are, hello.', '无论哪位主公，幸会。'],
    ['The one who survives longest wins.', '活得最久者胜。'],
  ],
  liru: [
    ['Advance! The Chancellor commands.', '相国有令，进军！'],
    ['The Chancellor must never hear of this.', '此事不可让相国知。'],
    ['I do not fight, but I do poison.', '李某不战，但会用毒。'],
    ['Phew. Lucky.', '好险，幸运。'],
    ['Quick, call the guards!', '护卫何在！'],
    ["It was all Dong Zhuo's idea!", '都是董卓的主意！'],
    ['Wine for all. It may be poisoned.', '各位请饮酒，或许有毒。'],
  ],
  lijue: [
    ['Charge! Plunder everything!', '冲！抢个干净！'],
    ['Run! Guo Si is coming too!', '快走，郭汜也来了！'],
    ['Li Jue of Liangzhou! Hand over your valuables!', '凉州李傕，留下买路财！'],
    ['Ha! Now loot the body!', '哈，搜他身上！'],
    ['Where is Guo Si when I need him?', '郭汜呢？快来！'],
    ['Do not kill me! I know where gold is!', '别杀我，我知道哪有钱！'],
    ["Chang'an is mine!", '长安归我了！'],
  ],
  guosi: [
    ['Forward, and grab all of it!', '向前，见财就抢！'],
    ['Retreat, and leave Li Jue behind!', '撤，别管李傕。'],
    ['I fight for gold and for spite.', '我为财而战，也为气。'],
    ['Haha, mine now.', '哈哈，东西归我了。'],
    ['Li Jue set me up!', '定是李傕陷害我！'],
    ['I will say whatever you want, quickly.', '想听什么，我都说。'],
    ['Victory and plunder!', '大胜，财物到手！'],
  ],
  huaxiong: [
    ['Hua Xiong leads. Fear me!', '华雄在此，休得放肆！'],
    ['Back! This enemy is no ordinary foe.', '且退，此敌不凡。'],
    ['Come on! Which of your lords dares?', '诸侯之中，谁敢出战！'],
    ['Pah. Bring the next one.', '再换一个来！'],
    ['What... the wine is still warm...', '怎……酒还是温的……'],
    ['I would rather die than beg.', '宁死不降！'],
    ['The coalition is a joke.', '十八路诸侯，不过如此。'],
  ],
  zhangliao: [
    ['Eight hundred men can break a hundred thousand! Charge!', '八百破十万，随我冲！'],
    ['Pull back! The ford is still ours.', '撤兵，渡口仍是我军的。'],
    ['Zhang Wenyuan of Yanmen is here!', '雁门张文远在此！'],
    ["Wuyuan's name stops babies crying. Now you know why.", '江东小儿，闻风丧胆。'],
    ['A fine strike. You earned it.', '好手段，我服。'],
    ['I will not betray Cao Cao.', '张辽不负丞相！'],
    ['Even Sun Quan paled at this.', '孙权望风而逃！'],
  ],
  liuyan: [
    ['Advance, steadily. I have time.', '稳步前进，不急。'],
    ['Back! I would like to rule in peace.', '且退，先保平安。'],
    ['I will not duel. Ask my officers.', '决斗？问我部下。'],
    ['Huh, it worked.', '咦，成了。'],
    ['I told them not to fight.', '早叫他们别打。'],
    ['I just wanted a quiet province.', '我只想守着益州。'],
    ['A calm, rich province is the best victory.', '安乐富庶，乃是大胜。'],
  ],
  liuzhang: [
    ['Uh, forward, everyone. Please?', '请诸位向前，好吗？'],
    ['Retreat! Oh, thank goodness.', '撤退，谢天谢地。'],
    ['I would rather make peace, honestly.', '其实我更想议和。'],
    ['Did I win? Truly?', '我赢了？真的？'],
    ['It was dangerous anyway.', '反正也危险。'],
    ['Please do not hurt my people.', '请勿伤我百姓。'],
    ['We won! I did not expect it.', '赢了！没想到！'],
  ],
  zhangren: [
    ['Archers up! Hold the pass!', '弓箭手上，守住关隘！'],
    ['Back to Luo. We still hold.', '退守雒城，仍可守。'],
    ['Zhang Ren of Shu stands here.', '蜀将张任在此！'],
    ['A loyal arrow flies straight.', '忠箭直飞，岂能偏。'],
    ['The horse stumbled. That is all.', '马失前蹄，不过如此。'],
    ['A loyal subject of Shu does not yield.', '忠臣不事二主！'],
    ['The pass holds. Shu is safe.', '关隘稳固，蜀地无忧！'],
  ],
  yanyan: [
    ['Old general, old gate, new arrows!', '老将老关，新箭齐发！'],
    ['Back inside the walls!', '退入城中！'],
    ['Shu has generals who lose their heads, not who surrender!', '蜀中只有断头将军，没有降将军！'],
    ['The old tiger still bites.', '老虎虽老，仍能咬人。'],
    ['Ah, a strong one.', '嗯，强敌。'],
    ['Cut off my head if you like. I will not bow.', '斩头便斩头，何怒为！'],
    ['Old and loyal, always on time.', '老而弥坚，终不负。'],
  ],
  wuyi: [
    ['Follow me. The quiet general strikes!', '随我前进，勿喧哗。'],
    ['Pull back neatly.', '整齐后撤。'],
    ['My brother-in-law is a lord; I need not shout.', '国舅从不喧哗。'],
    ['Done. Quietly.', '悄悄的，完成了。'],
    ['That hurt. Quietly.', '悄悄的，疼。'],
    ['I will serve whoever is kind.', '谁待我厚，我便事谁。'],
    ['A quiet victory is still one.', '安静的胜利也是胜利。'],
  ],
  huangquan: [
    ['Advance with measure. I have checked it.', '我算过了，向前。'],
    ['Hold. We lose here, but not later.', '此处可败，不可大败。'],
    ['I dislike this, but let me try.', '我不喜欢，但一试。'],
    ['As calculated.', '一如所料。'],
    ['My calculations never allowed for this.', '算漏了一步。'],
    ['I was loyal. That is all I will say.', '我曾尽忠，仅此而已。'],
    ['The numbers were in our favour.', '胜算本就在我。'],
  ],
  zhaoyun: [
    ['Zhao Zilong rides! Follow me!', '常山赵子龙在此，随我来！'],
    ["Cover the lord's family, then we fall back.", '护好主母，再撤。'],
    ['One spear, one heart. Come on!', '一杆枪，一腔胆，来战！'],
    ['Seven in, seven out. Nothing special.', '七进七出，不过寻常。'],
    ['My spear slowed. Never again.', '枪慢了半分，下次不会。'],
    ['I would sooner fall than see the young lord fall.', '少主安好，我死何惜！'],
    ['All of me, wholly courage.', '子龙一身都是胆也！'],
  ],
  taishici: [
    ['Follow Taishi Ci! My bow never lies!', '太史慈在此，随我冲！'],
    ['Pull back. A man of honour keeps his word.', '暂退，守信不失。'],
    ['Come, Little Conqueror! Let us fight!', '孙伯符，你我一战！'],
    ['A good fight. Even the winner thanks you.', '好一场恶战，多谢。'],
    ['Ha, I lost. Fine, I admire you.', '输了，我服你。'],
    ['Free me, and I shall return in three days.', '放我回，我必回来。'],
    ['A man should live to do great deeds.', '大丈夫生于乱世，当带三尺剑立不世之功！'],
  ],
  dianwei: [
    ["Dian Wei, the Lord's Guard, in the lead!", '典韦在此，保主公！'],
    ['I will hold them. Lord, run!', '主公快走，我断后！'],
    ['Twin halberds, one head each!', '一戟一首，上来！'],
    ['More heads for my halberds!', '再来，戟不嫌多！'],
    ['I... will not... move... Run, lord...', '主公，快走……'],
    ['Never. Do what you want.', '要杀便杀！'],
    ['The lord is safe. That is all.', '主公安好，足矣。'],
  ],
  xuchu: [
    ['The Tiger Fool charges! Move aside!', '虎痴来了，让开！'],
    ['Retreat? Oh, fine. Where is the food?', '撤？也行，吃的呢？'],
    ['I fight bare-chested if I must, just not hungry.', '赤膊上阵，来战！'],
    ['Heh. Did that count? Another!', '这算赢了？再来！'],
    ['I was hungry. That is why.', '我没吃饱才输。'],
    ['Feed me and we will talk.', '先给我吃饭再说。'],
    ['Victory! Now, dinner!', '大胜，开饭！'],
  ],
  xuhuang: [
    ['Orderly and disciplined. Advance!', '整军而进，不乱！'],
    ['Fall back; keep formation.', '保持阵形，后撤。'],
    ['My axe is quiet. My enemies are not.', '斧头静，敌人吵。'],
    ['The axe settles it.', '大斧之下，一切分明。'],
    ['A fair cut. I accept it.', '好手段，认输。'],
    ['I serve one lord. Do not ask more.', '我只事一主。'],
    ['The army kept its shape. That is enough.', '全军无乱，足矣。'],
  ],
  ganning: [
    ['Bells ring! The pirate is coming!', '锦帆贼来了，冲！'],
    ['Pull back quietly, bells first.', '悄悄退，先摘铃。'],
    ['Gan Xingba is here! Who is next?', '甘兴霸在此！'],
    ['A hundred riders, one night raid!', '百骑劫营，何足道哉！'],
    ['Next time I bring more riders.', '下次多带人来。'],
    ['I have served many lords. I can serve one more.', '事主不止一次。'],
    ['Wine and spoils for my riders!', '酒肉和战利品，兄弟们有份！'],
  ],
  huangzhong: [
    ['Old but not done! Archers, loose!', '老当益壮，放箭！'],
    ['Back, back! The old must pace himself.', '退，老夫稍歇。'],
    ['Do not call me old until I have fought you.', '休说老夫老，先战一场！'],
    ['An arrow to the helmet. Done.', '一箭射盔缨，足矣。'],
    ['Hm. An old man tires.', '老了，力不从心。'],
    ['Strip my armour if you want, not my pride.', '甲可脱，志不可夺。'],
    ['Dingjun Mountain remembers me.', '定军山上，老夫立功！'],
  ],
  weiyan: [
    ['Wei Yan leads! Take Changsha!', '魏延当先，攻下长沙！'],
    ['Back! They will regret not trusting me.', '他们迟早后悔不用我。'],
    ['Who dares call me a rebel?', '谁敢叫我反骨？'],
    ['See? My bones are fine.', '看我这反骨如何？'],
    ['Could you say my name in a nicer tone?', '换个客气点的口气喊我。'],
    ['I never wanted to betray. Truly.', '我从未想过反。'],
    ['We should have taken the Ziwu route.', '早听我子午谷之计就好。'],
  ],
  zhouyu: [
    ['Fire and sword! Forward!', '火攻已备，全军进击！'],
    ['Pull back. All is within my reckoning.', '暂退，一切皆在掌握。'],
    ['Music? I always hear a wrong note.', '曲有误，周郎顾。'],
    ['Elegant, yes?', '雅而胜之。'],
    ['Since Yu was born, why was Liang born too?', '既生瑜，何生亮！'],
    ['I wish only to see a last sunset.', '愿看最后一次日落。'],
    ['A fire so bright, even the river wept.', '一把火烧红江面！'],
  ],
  lusu: [
    ['Forward. Let us be generous.', '请向前，不必着急。'],
    ['Let us retreat and parley instead.', '不如退兵议和。'],
    ['I have a sword. Also an offer. Choose.', '我有剑，也有提议。'],
    ['No bloodshed beyond need.', '不必多流血。'],
    ['I think peace would have been wiser.', '早知应议和。'],
    ['Sir, may we talk before you decide?', '阁下，先谈谈如何？'],
    ['Good. Now, about the alliance.', '好，接下来谈同盟。'],
  ],
  fazheng: [
    ['Strike! Even a petty slight is repaid.', '睚眦之怨，必报！'],
    ['Retreat. One plan is never the only plan.', '撤，计不止一条。'],
    ['I am no warrior, but watch what I pull.', '我虽非武将，看我手段。'],
    ['One grudge, one repayment.', '一饭之德必偿。'],
    ['Humph. I will have my revenge.', '哼，此仇必报。'],
    ['I know where your supplies are.', '我知道你粮草在何处。'],
    ['Kindness repaid, grudges repaid. A fine day.', '恩怨分明，此战大胜。'],
  ],
  zhangsong: [
    ['Forward! I have the map in my head.', '我熟记地形，前进！'],
    ['Back! I have a better offer now.', '撤，我另有高见。'],
    ['I read a book once and never forget it.', '过目不忘，来比比。'],
    ['Clever, no?', '聪明吧？'],
    ['Ow! Who doubted my face?', '这脸怎么偏偏中了！'],
    ['Perhaps your lord needs a new ally?', '尊上或许缺个盟友？'],
    ['I told Liu Bei. He listened.', '我对玄德说过，他听了。'],
  ],
  chenqun: [
    ['Forward, fairly. Order matters.', '依序前进。'],
    ['Retreat; the rules say so.', '依法退兵。'],
    ['I do not fight. I recommend.', '我不战，我荐才。'],
    ['The ranking is clear.', '品级分明。'],
    ['I will submit a report on this.', '此事当上奏。'],
    ['Let me explain the Nine Ranks first.', '先听我讲九品之制。'],
    ['The system has proven its worth.', '制度立，则天下治。'],
  ],
  maliang: [
    ['Cavalry of Xiliang, charge!', '西凉铁骑，冲锋！'],
    ['Retreat; guard my family.', '退，保全家小。'],
    ['Ma Teng of Xiliang is here.', '西凉马腾在此！'],
    ['Do not mistake age for weakness.', '休将年迈当软弱。'],
    ['I misjudged. A mistake.', '我失算了。'],
    ['Kill me if you must. Spare my son.', '杀我可以，放过吾儿。'],
    ['Xiliang stands. Let the capital know.', '西凉不倒！'],
  ],
  machao: [
    ['Ma Mengqi leads! Follow the Brocade!', '锦马超来了，随我冲！'],
    ['Back! I will cut him down next time!', '下次再斩了他！'],
    ['I am Ma Mengqi! Who dares meet me?', '西凉马孟起，谁敢来战？'],
    ['See the Brocade Ma Chao!', '锦马超岂是浪得虚名！'],
    ['Why did I lose to this man?!', '怎会败给此人！'],
    ['I will not bow. I want vengeance!', '此仇不报，誓不为人！'],
    ['For Father, for Xiliang!', '为父报仇，为西凉雪恨！'],
  ],
};

const SHORT: Record<string, Short> = {
  xunyou: [
    ['Forward, quietly and with care.', '谋定后动，前进。'],
    ['I think before I speak. Mostly.', '我思而后言，多半如此。'],
  ],
  guojia: [
    ['A gamble? Forward then!', '赌一把，进军！'],
    ['Wine first, then the duel.', '先喝杯酒再说。'],
  ],
  simayi: [
    ['The patient win. Advance slowly.', '忍者胜，徐徐前进。'],
    ['I only look weak.', '我只是看似软弱。'],
  ],
  caohong: [
    ['Take my horse! Follow me!', '请君上马，随我冲！'],
    ['Gold and glory. In that order.', '金银财宝，先后有序。'],
  ],
  yuejin: [
    ['Small but fierce! Charge!', '身矮胆大，冲！'],
    ['Short man, long spear.', '个矮枪长，来战。'],
  ],
  lidian: [
    ['Forward, with learning in my heart.', '儒将领军，向前。'],
    ['Books taught me this.', '书中有此招。'],
  ],
  pangde: [
    ['Bring the coffin! Charge!', '抬棺决战，冲锋！'],
    ['I am not here to retreat.', '我来此，不为退。'],
  ],
  manchong: [
    ['Forward. Do not be tricked.', '勿中其计，进军。'],
    ['Bring me the ledger of your sins.', '拿你的罪状来。'],
  ],
  caopi: [
    ['Charge, and write a poem later.', '先冲，诗稍后作。'],
    ['A prince does not lose.', '太子岂有败理。'],
  ],
  caozhen: [
    ["Wei's army, forward!", '魏军，进击！'],
    ['Cao family blood runs true.', '曹家血脉，岂是虚名。'],
  ],
  dengai: [
    ['Climb the cliff! Surprise them!', '翻山越岭，奇袭！'],
    ['I-I mean, Deng Ai is here!', '艾艾……邓艾在此！'],
  ],
  simashi: [
    ['Everything is ready. Advance.', '早有准备，进。'],
    ['Do not look at my eye. Look at my blade.', '莫看我眼，看我剑。'],
  ],
  caorui: [
    ['Forward, men of Wei!', '魏军将士，向前！'],
    ['The Emperor fights too!', '天子亲征，来战！'],
  ],
  zhugeliang: [
    ['The east wind is ready. Advance as planned.', '东风已至，依计进军。'],
    ['I have a fan, not a sword.', '吾有羽扇，不用剑。'],
  ],
  pangtong: [
    ['The chain is set. Strike!', '连环已成，进攻！'],
    ['The Young Phoenix has arrived.', '凤雏在此。'],
  ],
  maliang_shu: [
    ['White Brows are best. Forward.', '白眉最良，前进。'],
    ['I would rather speak than fight.', '我宁愿言，不愿战。'],
  ],
  masu: [
    ['Take the hill! Wait... advance!', '占山！不对，进军！'],
    ['I read it in a book.', '兵书上是这么说的。'],
  ],
  wangping: [
    ['I know few characters, but many battles.', '识字不多，战阵无数。'],
    ['Hold the pass!', '守住街亭！'],
  ],
  jiangwei: [
    ["The Prime Minister's will lives! Forward!", '丞相遗志，在我身！'],
    ['Jiang Boyue, at your service.', '姜伯约在此！'],
  ],
  jiangwan: [
    ['Steady supplies, steady advance.', '粮草稳妥，稳步前进。'],
    ['I am calm, even in a fight.', '临战亦从容。'],
  ],
  feiyi: [
    ['Forward, but let me finish this game first.', '先下完这盘棋再进。'],
    ['Calm is a weapon.', '冷静即是兵器。'],
  ],
  liaohua: [
    ['Old soldier, still here! Charge!', '老兵未死，冲！'],
    ['I outlived them all.', '我活得比他们都久。'],
  ],
  guanping: [
    ['For Father! Forward!', '为父亲，冲！'],
    ['Do not mock my family.', '休辱我家门。'],
  ],
  liushan: [
    ['Er... forward? Right, forward.', '呃，冲？好，冲。'],
    ['I am quite happy here. I do not want to go home.', '此间乐，不思蜀。'],
  ],
  sunquan: [
    ['Be as steady as the Sun! Forward!', '生子当如孙仲谋！'],
    ['Let me see your best, then.', '让我看看你的本事。'],
  ],
  zhangzhao: [
    ['I advise caution. But go on.', '我劝谨慎，罢了，进。'],
    ['Do not duel me. Surrender is wiser.', '不如投降为上。'],
  ],
  lvmeng: [
    ['Three days apart, and see me anew!', '士别三日，刮目相看！'],
    ['Do not mistake me for a mere soldier.', '休将我当莽夫。'],
  ],
  luxun: [
    ['The scholar leads. Follow the plan.', '书生领军，依计行事。'],
    ['Burn the camps, one by one.', '火烧连营七百里。'],
  ],
  zhugejin: [
    ['Forward, with gentle manners.', '请君前进，温和为上。'],
    ['I am the one who always smiles.', '我是总在笑的那个。'],
  ],
  lingtong: [
    ['For my father! Charge!', '为了父亲，冲！'],
    ['Gan Ning owes me a fight.', '甘宁欠我一战。'],
  ],
  zhoutai: [
    ['A hundred scars say I will not fall.', '身中百创，不倒。'],
    ['Cut me again, if you can.', '再砍我试试。'],
  ],
  zhuran: [
    ['Forward, Wu! Calm and bold.', '沉着大胆，前进。'],
    ['I fight quietly.', '我默默战斗。'],
  ],
  xusheng: [
    ['Reeds as walls, fire as arrows!', '芦苇为墙，火为箭！'],
    ['Defend the river!', '守住江面！'],
  ],
  dingfeng: [
    ['Short blades, fast feet. Charge!', '短兵快步，冲！'],
    ['Snow is no hindrance to me.', '雪地亦不阻我。'],
  ],
  zhugeke: [
    ['I am the cleverest, naturally.', '我自然是最聪明的。'],
    ['I could talk a donkey into submission.', '我能说得驴也服。'],
  ],
  gongsunzan: [
    ['White Horse Volunteers, charge!', '白马义从，冲锋！'],
    ['I rule the north with white horses.', '以白马称雄北方。'],
  ],
  taoqian: [
    ['I will give Xuzhou to the worthy. Forward.', '徐州让贤，进军。'],
    ['I am too old for this.', '我年事已高。'],
  ],
  liubiao: [
    ['Forward... gently, south of the Han River.', '汉水以南，缓缓前进。'],
    ['I prefer a nice garden.', '我更爱园林。'],
  ],
  yuanshu: [
    ['I am the Emperor! Advance!', '朕乃天子，进军！'],
    ['Bring me honey water!', '取蜜浆来！'],
  ],
  hansui: [
    ['Xiliang knows how to fight! Forward!', '西凉自有战法，进！'],
    ['Your friend is my enemy. Soon.', '今日之友，明日之敌。'],
  ],
  zhanglu: [
    ['Heavenly Masters, forward!', '五斗米道，向前！'],
    ['Hanzhong belongs to me.', '汉中归我。'],
  ],
  chengong: [
    ['My lord, listen to me! Forward!', '主公，听我一言，进！'],
    ['I once let Cao Cao go. A mistake.', '我曾放走曹操，悔之。'],
  ],
  gaoshun: [
    ['Trap Camp, forward! Seven hundred strong!', '陷阵营，随我冲！'],
    ['We never fail to break a line.', '破阵从无失手。'],
  ],
  kongrong: [
    ['The pear goes to my elder brother. Forward!', '梨让兄长，进军。'],
    ['I can quote poems better than I can fight.', '我善诵诗，不善战。'],
  ],
  xuyou: [
    ['I advised this, so I deserve the credit.', '此计是我出的。'],
    ['Cao Cao will thank me.', '孟德必谢我。'],
  ],
};

const MOMENTS: readonly LineMoment[] = [
  'charge',
  'rout',
  'duelStart',
  'duelWin',
  'duelLose',
  'captured',
  'victory',
];

const buildOfficerLines = (): Record<string, Partial<Record<LineMoment, LinePair>>> => {
  const out: Record<string, Partial<Record<LineMoment, LinePair>>> = {};
  for (const [id, rows] of Object.entries(FULL)) {
    const entry: Partial<Record<LineMoment, LinePair>> = {};
    MOMENTS.forEach((moment, index) => {
      entry[moment] = pair(rows[index] as P);
    });
    out[id] = Object.freeze(entry);
  }
  for (const [id, [charge, duelStart]] of Object.entries(SHORT)) {
    out[id] = Object.freeze({ charge: pair(charge), duelStart: pair(duelStart) });
  }
  return out;
};

export const OFFICER_LINES: Readonly<Record<string, Partial<Record<LineMoment, LinePair>>>> =
  Object.freeze(buildOfficerLines());

const lines = (rows: Full): Record<LineMoment, LinePair> =>
  Object.freeze(Object.fromEntries(MOMENTS.map((m, i) => [m, pair(rows[i] as P)]))) as Record<
    LineMoment,
    LinePair
  >;

export const TRAIT_LINES: Readonly<Record<Trait, Record<LineMoment, LinePair>>> = Object.freeze({
  benevolent: lines([
    ['For the people, onward!', '为了百姓，前进！'],
    ['Spare the soldiers. Fall back.', '爱惜士卒，撤退。'],
    ['I would rather not, but I will.', '我不愿战，但不得不战。'],
    ['I take no pleasure in this.', '胜之不武，心有不忍。'],
    ['Forgive me. I have failed you.', '愧对诸君。'],
    ['Spare my soldiers. Do as you like with me.', '放过士卒，任凭处置。'],
    ['May the people rest tonight.', '愿百姓今夜安眠。'],
  ]),
  fierce: lines([
    ['Charge! Break them!', '冲锋，杀！'],
    ['Back! We will return and kill them all!', '暂退，再杀回来！'],
    ['Come on! Who fears whom?', '来吧，谁怕谁！'],
    ['Ha! Too weak!', '哈，太弱了！'],
    ['Ugh! You will pay for this!', '可恶，此仇必报！'],
    ['Kill me, then! I am not afraid!', '要杀便杀，不惧！'],
    ['Victory! Fetch the wine!', '大胜，取酒来！'],
  ]),
  cunning: lines([
    ['The plan is set. Advance.', '计策已定，进军。'],
    ['Part of the plan. Withdraw.', '此亦计中，退。'],
    ['Think before you strike.', '先想，再出手。'],
    ['As I predicted.', '正如我所料。'],
    ['Somehow I missed that move.', '竟漏算了这一步。'],
    ['Let us talk. I have much to say.', '我们谈谈如何？'],
    ['Everything went according to plan.', '一切尽在计中。'],
  ]),
  loyal: lines([
    ['For my lord, forward!', '为主公，向前！'],
    ['I fall back only to return.', '暂退，只为再返。'],
    ['I will not yield an inch.', '寸步不让。'],
    ["For my lord's sake.", '为主公故。'],
    ['I failed my lord. I am ashamed.', '愧对主公。'],
    ['A loyal subject does not bend.', '忠臣不事二主。'],
    ["The lord's cause prevails.", '主公大业有成。'],
  ]),
  greedy: lines([
    ['Forward! The spoils are waiting!', '前进，战利品在等！'],
    ['Retreat! Grab what you can first!', '撤，先抢再走！'],
    ['Win and I get paid, right?', '赢了有赏钱吧？'],
    ['Pay up! Right now!', '赏钱，立刻付！'],
    ['My purse! My precious purse!', '我的钱袋！'],
    ['I can make you rich. Let me go.', '放了我，让你发财。'],
    ['Count the gold! All of it!', '清点金银，一个不少！'],
  ]),
});

export const DEFAULT_LINES: Readonly<Record<LineMoment, LinePair>> = lines([
  ['Forward! Attack!', '全军进攻！'],
  ['Retreat! Fall back!', '撤退，快撤！'],
  ['Come, let us settle this.', '来，一决高下。'],
  ['Victory is mine.', '胜负已分。'],
  ['I was careless. Well fought.', '大意了，佩服。'],
  ['Do what you will.', '悉听尊便。'],
  ['A great victory!', '大获全胜！'],
]);

/** Officer's own line, else the first of the officer's traits that has one, else the default. */
export function officerLine(officerId: string, moment: LineMoment, locale: Locale): string {
  const own = OFFICER_LINES[officerId]?.[moment];
  if (own) return own[locale];
  for (const trait of OFFICER_TRAITS[officerId] ?? []) {
    const line = TRAIT_LINES[trait]?.[moment];
    if (line) return line[locale];
  }
  return DEFAULT_LINES[moment][locale];
}
